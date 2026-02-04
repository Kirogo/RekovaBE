// routes/commentRoutes.js
const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const { protect } = require('../middleware/auth');
const mongoose = require('mongoose');

// All routes in this file are protected
router.use(protect);

// @desc    Get comments for a customer
// @route   GET /api/comments/customer/:customerId
// @access  Private
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    console.log('🔍 Fetching comments for customer:', customerId);
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer ID format' 
      });
    }

    const comments = await Comment.find({ customerId })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${comments.length} comments for customer ${customerId}`);

    res.json({
      success: true,
      data: {
        comments,
        count: comments.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching comments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching comments',
      error: error.message
    });
  }
});

// @desc    Add a comment to a customer
// @route   POST /api/comments/customer/:customerId
// @access  Private
router.post('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { comment, type = 'follow_up', customerName } = req.body;
    const user = req.user;

    console.log('💾 Adding comment for customer:', customerId);
    console.log('📝 Comment data:', { comment, type, customerName });
    console.log('👤 User:', user.name || user.username);

    // Validate input
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment text is required' 
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer ID format' 
      });
    }

    const newComment = new Comment({
      customerId,
      comment: comment.trim(),
      type,
      author: user.name || user.username || 'Agent',
      authorId: user._id,
      customerName: customerName || ''
    });

    await newComment.save();

    console.log('✅ Comment saved successfully:', newComment._id);

    res.json({
      success: true,
      data: {
        comment: newComment,
        message: 'Comment added successfully'
      }
    });
  } catch (error) {
    console.error('❌ Error adding comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while adding comment',
      error: error.message
    });
  }
});

// @desc    Get all comments (for admin/supervisor)
// @route   GET /api/comments
// @access  Private (Admin/Supervisor)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [comments, total] = await Promise.all([
      Comment.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Comment.countDocuments()
    ]);

    res.json({
      success: true,
      data: {
        comments,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching all comments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching comments' 
    });
  }
});

// @desc    Update a comment
// @route   PUT /api/comments/:commentId
// @access  Private (Author only)
router.put('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { comment } = req.body;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid comment ID format' 
      });
    }

    const existingComment = await Comment.findById(commentId);
    
    if (!existingComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    // Check if user is the author
    if (existingComment.authorId.toString() !== user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only edit your own comments' 
      });
    }

    existingComment.comment = comment.trim();
    existingComment.updatedAt = new Date();
    
    await existingComment.save();

    res.json({
      success: true,
      data: {
        comment: existingComment,
        message: 'Comment updated successfully'
      }
    });
  } catch (error) {
    console.error('❌ Error updating comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating comment' 
    });
  }
});

// @desc    Delete a comment
// @route   DELETE /api/comments/:commentId
// @access  Private (Author or Admin)
router.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid comment ID format' 
      });
    }

    const existingComment = await Comment.findById(commentId);
    
    if (!existingComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    // Check if user is the author or an admin
    const isAuthor = existingComment.authorId.toString() === user._id.toString();
    const isAdmin = user.role === 'admin';
    
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not authorized to delete this comment' 
      });
    }

    await Comment.findByIdAndDelete(commentId);

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting comment' 
    });
  }
});

module.exports = router;