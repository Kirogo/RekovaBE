// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes - verify JWT token
 */
exports.protect = async (req, res, next) => {
  try {
    // DEBUG LOGGING
    console.log('=== AUTH MIDDLEWARE DEBUG ===');
    console.log('Request URL:', req.originalUrl);
    console.log('Authorization header:', req.headers.authorization);
    
    let token;
    
    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('Token extracted:', token ? `Length: ${token.length}, First 30 chars: ${token.substring(0, 30)}...` : 'NO TOKEN');
      
      // Check JWT structure
      if (token) {
        const parts = token.split('.');
        console.log('JWT parts count:', parts.length);
        if (parts.length !== 3) {
          console.error('ERROR: JWT malformed - should have 3 parts');
          return res.status(401).json({
            success: false,
            message: 'Malformed token',
            debug: { parts: parts.length }
          });
        }
      }
    } else {
      console.log('No Authorization header or not Bearer token');
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
        debug: 'No token provided'
      });
    }
    
    // Verify token with more detailed error handling
    try {
      console.log('Verifying token with secret...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded successfully:', { 
        id: decoded.id, 
        username: decoded.username, 
        role: decoded.role 
      });
      
      // Check if user still exists
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        console.log('User not found in database for id:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Check if user is active
      if (!user.isActive) {
        console.log('User account deactivated:', user.username);
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      
      // Attach user to request
      req.user = user;
      console.log('Auth successful for user:', user.username);
      next();
      
    } catch (verifyError) {
      console.error('Token verification error:', verifyError.name, verifyError.message);
      
      if (verifyError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          debug: verifyError.message
        });
      }
      
      if (verifyError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      }
      
      throw verifyError; // Re-throw for outer catch
    }
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ... rest of the file remains the same (authorize, allowAllAuthenticated, etc.)
/**
 * Authorize specific roles
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    // Convert 'agent' to 'officer' for backward compatibility
    const userRole = req.user.role === 'agent' ? 'officer' : req.user.role;
    
    // Map 'agent' in allowed roles to 'officer'
    const allowedRoles = roles.map(role => role === 'agent' ? 'officer' : role);
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `User role '${userRole}' is not authorized to access this route`,
        data: {
          requiredRoles: allowedRoles,
          userRole: userRole
        },
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
};

/**
 * Authorize all authenticated users - use this for common routes
 * This is the default - just checks if user is authenticated
 */
exports.allowAllAuthenticated = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
};

/**
 * Check transaction amount limit for officers
 */
exports.checkTransactionLimit = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    // Convert amount to number
    const transactionAmount = parseFloat(amount);
    
    // Check if amount is valid
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction amount'
      });
    }
    
    // Get user's transaction limit from permissions
    const userLimit = user.permissions?.transactionLimit || 50000;
    
    // For officers: check if amount exceeds limit
    if (user.role === 'officer' && transactionAmount > userLimit) {
      return res.status(403).json({
        success: false,
        message: `Transaction amount (KES ${transactionAmount.toLocaleString()}) exceeds your limit of KES ${userLimit.toLocaleString()}. Requires supervisor approval.`,
        requiresApproval: true,
        limit: userLimit,
        transactionAmount: transactionAmount
      });
    }
    
    // For supervisors and admins: no limit
    req.transactionRequiresApproval = false;
    next();
    
  } catch (error) {
    console.error('Transaction limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking transaction limits'
    });
  }
};

/**
 * Check if user can approve transactions
 */
exports.canApproveTransactions = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }
  
  // Check if user has approval permission
  if (req.user.permissions?.canApproveTransactions !== true) {
    return res.status(403).json({
      success: false,
      message: 'User is not authorized to approve transactions'
    });
  }
  
  next();
};

/**
 * Check if user can view all performance data
 */
exports.canViewAllPerformance = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }
  
  // All users can view all performance (global competition)
  // This matches your requirement for officers to see colleague performance
  next();
};

/**
 * Check if user can manage users
 */
exports.canManageUsers = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }
  
  // Only admins can manage users
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only administrators can manage users'
    });
  }
  
  next();
};

/**
 * Check if user can export data
 */
exports.canExportData = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }
  
  // Admins and supervisors can export
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({
      success: false,
      message: 'User is not authorized to export data'
    });
  }
  
  next();
};

/**
 * Check if user can access management features
 */
exports.canManageSettings = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }
  
  // Only admins can manage system settings
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only administrators can manage system settings'
    });
  }
  
  next();
};

/**
 * Get user's team members (for supervisors)
 */
exports.getTeamMembers = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    // If user is supervisor or admin, get all officers
    if (user.role === 'supervisor' || user.role === 'admin') {
      const teamMembers = await User.find({ 
        role: 'officer',
        isActive: true 
      })
      .select('-password')
      .sort({ 'performanceMetrics.totalCollections': -1 });
      
      req.teamMembers = teamMembers;
    } else {
      // For officers, get all other officers (colleagues)
      const colleagues = await User.find({ 
        role: 'officer',
        _id: { $ne: user._id }, // Exclude self
        isActive: true 
      })
      .select('-password')
      .sort({ 'performanceMetrics.totalCollections': -1 })
      .limit(20); // Limit to top 20 performers
      
      req.teamMembers = colleagues;
    }
    
    next();
  } catch (error) {
    console.error('Error getting team members:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team members'
    });
  }
};