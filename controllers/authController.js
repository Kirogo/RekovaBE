const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ActivityLogger = require('../services/activityLogger');

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  const startTime = Date.now();
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  try {
    const { username, password } = req.body;
    
    console.log('Login attempt for:', username);
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }
    
    // Find user by username or email
    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username.toLowerCase() }
      ]
    });
    
    if (!user) {
      // Log failed login attempt
      await ActivityLogger.logError(
        null,
        'LOGIN',
        `Failed login attempt for username: ${username} - User not found`,
        { code: 'USER_NOT_FOUND' },
        {
          ipAddress,
          userAgent,
          usernameAttempt: username
        }
      );
      
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      await ActivityLogger.logError(
        user._id,
        'LOGIN',
        `Login attempt for deactivated account: ${user.username}`,
        { code: 'ACCOUNT_DEACTIVATED' },
        {
          ipAddress,
          userAgent
        }
      );
      
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator.'
      });
    }
    
    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      // Log failed login attempt
      await ActivityLogger.logError(
        user._id,
        'LOGIN',
        `Failed login attempt for user: ${user.username} - Invalid password`,
        { code: 'INVALID_PASSWORD' },
        {
          ipAddress,
          userAgent
        }
      );
      
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Update performance metrics
    user.performanceMetrics.loginCount = (user.performanceMetrics.loginCount || 0) + 1;
    
    // Check and update streak
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (!user.lastLogin) {
      // First login
      user.currentStreak = 1;
    } else {
      const lastLoginDate = new Date(user.lastLogin);
      const daysSinceLastLogin = Math.floor((today - lastLoginDate) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastLogin === 1) {
        // Consecutive day login
        user.currentStreak += 1;
        if (user.currentStreak > user.longestStreak) {
          user.longestStreak = user.currentStreak;
        }
      } else if (daysSinceLastLogin > 1) {
        // Broken streak
        user.currentStreak = 1;
      }
      // If same day, streak remains unchanged
    }

    // Update last login
    user.lastLogin = today;
    
    // Add today's activity record if not exists
    const todayStr = today.toISOString().split('T')[0];
    const todayActivity = user.dailyActivity.find(activity => 
      activity.date.toISOString().split('T')[0] === todayStr
    );
    
    if (!todayActivity) {
      user.dailyActivity.push({
        date: today,
        loginTime: today
      });
    } else if (!todayActivity.loginTime) {
      todayActivity.loginTime = today;
    }
    
    await user.save();

    // Generate JWT token with enhanced payload
    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username, 
        role: user.role,
        permissions: user.permissions,
        fullName: user.fullName || user.username
      },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '8h' }
    );

    // Prepare user response with permissions
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      department: user.department,
      fullName: user.fullName,
      permissions: user.permissions,
      performanceMetrics: user.performanceMetrics,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      achievements: user.achievements,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Log successful login
    await ActivityLogger.logAuth(
      user._id,
      'LOGIN',
      ipAddress,
      userAgent,
      {
        success: true,
        loginTime: today,
        streak: user.currentStreak,
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // Log login error
    await ActivityLogger.logError(
      null,
      'LOGIN',
      'System error during login',
      error,
      {
        ipAddress,
        userAgent,
        usernameAttempt: req.body.username
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

/**
 * @desc    Get current user profile with permissions
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getCurrentUser = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Enhance response with virtual fields and permissions
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      department: user.department,
      fullName: user.fullName,
      permissions: user.permissions,
      performanceMetrics: user.performanceMetrics,
      performanceScore: user.performanceScore,
      roleDescription: user.roleDescription,
      permissionsSummary: user.permissionsSummary,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      achievements: user.achievements,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      settings: user.settings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Log profile view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: 'Viewed own profile details',
      resourceType: 'USER',
      resourceId: user._id,
      duration: Date.now() - startTime,
      tags: ['profile', 'view']
    });

    res.json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    console.error('Get current user error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user.id,
      'USER_VIEW',
      'Failed to fetch user profile',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching user data'
    });
  }
};

/**
 * @desc    Debug endpoint to check users (for development only)
 * @route   GET /api/auth/debug
 * @access  Private (Admin only)
 */
exports.debugUsers = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Only allow admins to use this endpoint
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const users = await User.find({}).select('username email role permissions isActive createdAt lastLogin');
    
    // Add permissions summary for debugging
    const enhancedUsers = users.map(user => ({
      ...user.toObject(),
      permissionsSummary: user.permissionsSummary
    }));
    
    // Log debug action
    await ActivityLogger.logSystem(
      req.user.id,
      'SYSTEM_DEBUG',
      'Admin debugged user accounts',
      {
        userCount: users.length,
        duration: Date.now() - startTime
      }
    );
    
    res.json({
      success: true,
      data: enhancedUsers
    });
  } catch (error) {
    console.error('Debug users error:', error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to debug users',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * @desc    Get system roles and their descriptions
 * @route   GET /api/auth/roles
 * @access  Private (Admin only)
 */
exports.getRoles = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Only admins can view role definitions
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const roles = {
      admin: {
        description: 'Full system administrator with all privileges',
        permissions: [
          'Manage all users',
          'Approve all transactions',
          'View all performance data',
          'Export any data',
          'Manage system settings',
          'No transaction limits'
        ],
        canCreate: ['admin', 'supervisor', 'officer']
      },
      supervisor: {
        description: 'Team leader with transaction approval authority',
        permissions: [
          'Approve large transactions',
          'View all team performance',
          'Export team data',
          'No transaction limits for approval',
          'Cannot manage users',
          'Cannot change system settings'
        ],
        canCreate: ['officer'] // Supervisors can only create officers
      },
      officer: {
        description: 'Collections officer with standard privileges',
        permissions: [
          'View all colleague performance (global competition)',
          'Create transactions up to limit',
          'Create and manage promises',
          'Add customer comments',
          'Cannot approve transactions',
          'Transaction limit: KES 50,000'
        ],
        canCreate: [] // Officers cannot create other users
      }
    };
    
    // Log role view
    await ActivityLogger.logSystem(
      req.user.id,
      'SYSTEM_VIEW',
      'Admin viewed system role definitions',
      {
        duration: Date.now() - startTime
      }
    );
    
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Get roles error:', error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch role definitions',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching roles'
    });
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = async (req, res) => {
  const startTime = Date.now();
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  try {
    // Record logout time in daily activity
    const user = await User.findById(req.user.id);
    if (user) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const todayActivity = user.dailyActivity.find(activity => 
        activity.date.toISOString().split('T')[0] === todayStr
      );
      
      if (todayActivity && !todayActivity.logoutTime) {
        todayActivity.logoutTime = today;
        
        // Calculate active duration if login time exists
        if (todayActivity.loginTime) {
          const loginTime = new Date(todayActivity.loginTime);
          todayActivity.activeDuration = Math.floor((today - loginTime) / (1000 * 60)); // minutes
        }
        
        await user.save();
      }
    }
    
    // Log logout
    await ActivityLogger.logAuth(
      req.user.id,
      'LOGOUT',
      ipAddress,
      userAgent,
      {
        success: true,
        duration: Date.now() - startTime
      }
    );
    
    // Since we're using JWT, client just needs to discard the token
    res.json({
      success: true,
      message: 'Logout successful. Please discard your token.'
    });
  } catch (error) {
    console.error('Logout error:', error);
    
    await ActivityLogger.logError(
      req.user.id,
      'LOGOUT',
      'Failed during logout process',
      error,
      {
        ipAddress,
        userAgent
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
};

/**
 * @desc    Register new user (Admin only)
 * @route   POST /api/auth/register
 * @access  Private (Admin only)
 */
exports.register = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can register new users'
      });
    }
    
    const { username, email, password, firstName, lastName, phone, role, department } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email, and password'
      });
    }
    
    // Validate role assignment
    const validRoles = ['admin', 'supervisor', 'officer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }
    
    // Check permission to create specific role
    if (role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only existing admins can create new admin users'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { username: username },
        { email: email.toLowerCase() }
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this username or email already exists'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user with initial performance metrics
    const userData = {
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role: role || 'officer', // Default to officer
      department: department || 'Collections',
      createdBy: req.user._id,
      performanceMetrics: {
        dailyTarget: 50000,
        monthlyTarget: 1000000,
        totalCollections: 0,
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        averageTransactionAmount: 0,
        efficiencyRating: 0,
        loginCount: 0
      }
    };
    
    const user = await User.create(userData);
    
    // Generate token for new user
    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username, 
        role: user.role,
        permissions: user.permissions,
        fullName: user.fullName
      },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '8h' }
    );
    
    // Prepare user response
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      department: user.department,
      fullName: user.fullName,
      permissions: user.permissions,
      performanceMetrics: user.performanceMetrics,
      isActive: user.isActive,
      createdAt: user.createdAt
    };
    
    // Log user creation
    await ActivityLogger.logUserManagement(
      req.user.id,
      'USER_CREATE',
      user,
      {
        createdRole: user.role,
        createdBy: req.user.username,
        duration: Date.now() - startTime
      }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User with this username or email already exists'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    // Log registration error
    await ActivityLogger.logError(
      req.user.id,
      'USER_CREATE',
      'Failed to register new user',
      error,
      {
        username: req.body.username,
        email: req.body.email,
        role: req.body.role
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error registering user'
    });
  }
};

/**
 * @desc    Change user password
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
exports.changePassword = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      // Log failed password change attempt
      await ActivityLogger.logError(
        userId,
        'PASSWORD_CHANGE',
        'Failed password change - Incorrect current password',
        { code: 'INCORRECT_CURRENT_PASSWORD' },
        {}
      );
      
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();
    
    // Log successful password change
    await ActivityLogger.logAuth(
      userId,
      'PASSWORD_CHANGE',
      req.ip,
      req.get('User-Agent'),
      {
        success: true,
        duration: Date.now() - startTime
      }
    );
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    
    await ActivityLogger.logError(
      req.user.id,
      'PASSWORD_CHANGE',
      'Failed to change password',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error changing password'
    });
  }
};

/**
 * @desc    Get user permissions for frontend
 * @route   GET /api/auth/permissions
 * @access  Private
 */
exports.getPermissions = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const user = await User.findById(req.user.id).select('role permissions');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Return permissions in frontend-friendly format
    const permissions = {
      role: user.role,
      canManageUsers: user.permissions?.canManageUsers || false,
      canApproveTransactions: user.permissions?.canApproveTransactions || false,
      canViewAllPerformance: user.permissions?.canViewAllPerformance || false,
      canExportData: user.permissions?.canExportData || false,
      canManageSettings: user.permissions?.canManageSettings || false,
      transactionLimit: user.permissions?.transactionLimit || 50000,
      description: user.roleDescription
    };
    
    // Log permission view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: 'Viewed user permissions',
      resourceType: 'USER',
      resourceId: user._id,
      duration: Date.now() - startTime,
      tags: ['permissions', 'view']
    });
    
    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch permissions',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching permissions'
    });
  }
};

/**
 * @desc    Simple register endpoint (for testing, matches the simple version you had)
 * @route   POST /api/auth/simple-register
 * @access  Public (for testing only)
 */
exports.simpleRegister = async (req, res) => {
  const startTime = Date.now();
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  try {
    const { username, email, password, role } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User already exists' 
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role || 'officer'
    });
    
    // Create JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );
    
    // Log simple registration (for testing)
    await ActivityLogger.log({
      userId: user._id,
      action: 'USER_CREATE',
      description: `Simple registration for ${username} (${role || 'officer'})`,
      resourceType: 'USER',
      resourceId: user._id,
      ipAddress,
      userAgent,
      duration: Date.now() - startTime,
      tags: ['simple-register', 'test']
    });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Simple register error:', error);
    
    await ActivityLogger.logError(
      null,
      'USER_CREATE',
      'Failed simple registration',
      error,
      {
        ipAddress,
        userAgent,
        username: req.body.username,
        email: req.body.email
      }
    );
    
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

/**
 * @desc    Simple login endpoint (for testing, matches the simple version you had)
 * @route   POST /api/auth/simple-login
 * @access  Public (for testing only)
 */
exports.simpleLogin = async (req, res) => {
  const startTime = Date.now();
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      await ActivityLogger.logError(
        null,
        'LOGIN',
        `Simple login failed - User not found: ${email}`,
        { code: 'USER_NOT_FOUND' },
        { ipAddress, userAgent }
      );
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await ActivityLogger.logError(
        user._id,
        'LOGIN',
        `Simple login failed - Invalid password for: ${email}`,
        { code: 'INVALID_PASSWORD' },
        { ipAddress, userAgent }
      );
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );
    
    // Log successful simple login
    await ActivityLogger.logAuth(
      user._id,
      'LOGIN',
      ipAddress,
      userAgent,
      {
        success: true,
        method: 'simple',
        duration: Date.now() - startTime
      }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Simple login error:', error);
    
    await ActivityLogger.logError(
      null,
      'LOGIN',
      'System error during simple login',
      error,
      {
        ipAddress,
        userAgent,
        email: req.body.email
      }
    );
    
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};