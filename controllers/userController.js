//controllers/userController.js
const User = require('../models/User');

// Get all users with role-based filtering
exports.getUsers = async (req, res) => {
  try {
    const { role, department, isActive } = req.query;
    const currentUser = req.user;
    
    let query = {};
    
    // Admins can see all users
    if (currentUser.role === 'admin') {
      // Apply filters if provided
      if (role) query.role = role;
      if (department) query.department = department;
      if (isActive !== undefined) query.isActive = isActive === 'true';
    } 
    // Supervisors can see all officers
    else if (currentUser.role === 'supervisor') {
      query.role = 'officer';
      query.isActive = true;
    } 
    // Officers can only see themselves and colleagues (for performance viewing)
    else {
      query.isActive = true;
      // Will handle in the response to include all officers for competition
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ 'performanceMetrics.totalCollections': -1 });
    
    // For officers, ensure they see all colleagues for competition
    if (currentUser.role === 'officer') {
      const allOfficers = await User.find({ 
        role: 'officer',
        isActive: true 
      })
      .select('-password -email -phone -settings')
      .sort({ 'performanceMetrics.totalCollections': -1 });
      
      return res.json({
        success: true,
        data: allOfficers
      });
    }
    
    res.json({
      success: true,
      data: users
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users'
    });
  }
};

// Get performance leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const { period = 'monthly', limit = 20 } = req.query;
    const currentUser = req.user;
    
    let startDate;
    const now = new Date();
    
    // Set date range based on period
    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'monthly':
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }
    
    // Get all active officers sorted by performance
    const leaderboard = await User.find({
      role: 'officer',
      isActive: true,
      'performanceMetrics.totalCollections': { $gt: 0 }
    })
    .select('-password -email -phone -settings')
    .sort({ 'performanceMetrics.efficiencyRating': -1, 'performanceMetrics.totalCollections': -1 })
    .limit(parseInt(limit));
    
    // Add rank
    const rankedLeaderboard = leaderboard.map((user, index) => ({
      ...user.toObject(),
      rank: index + 1,
      performanceScore: user.performanceScore
    }));
    
    // Include current user if not in top list
    const currentUserInList = rankedLeaderboard.find(u => u._id.toString() === currentUser._id.toString());
    let userRank = null;
    
    if (!currentUserInList && currentUser.role === 'officer') {
      const currentUserRank = await User.countDocuments({
        role: 'officer',
        isActive: true,
        $or: [
          { 'performanceMetrics.efficiencyRating': { $gt: currentUser.performanceMetrics.efficiencyRating } },
          { 
            'performanceMetrics.efficiencyRating': currentUser.performanceMetrics.efficiencyRating,
            'performanceMetrics.totalCollections': { $gt: currentUser.performanceMetrics.totalCollections }
          }
        ]
      });
      
      userRank = currentUserRank + 1;
    }
    
    res.json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        currentUserRank: userRank,
        period,
        updatedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching leaderboard'
    });
  }
};