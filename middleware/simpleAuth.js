// backend/middleware/simpleAuth.js


const simpleAuth = (req, res, next) => {
  console.log('🔐 Simple auth middleware called');
  
  // For development only - bypass actual authentication
  req.user = {
    _id: 'dev-user-id',
    id: 'dev-user-id',
    username: 'developer',
    name: 'Development User',
    role: 'admin'
  };
  
  console.log('✅ User attached to request:', req.user.username);
  next();
};

module.exports = simpleAuth;