//middleware/frontendDebug.js
/**
 * Middleware to debug and fix frontend requests
 */
exports.frontendDebug = (req, res, next) => {
  // Log incoming requests from frontend
  console.log(`📱 Frontend Request: ${req.method} ${req.url}`);
  
  // Fix common frontend issues
  if (req.query.customerId === 'undefined') {
    delete req.query.customerId;
    console.log('   ⚠️  Fixed: Removed undefined customerId from query');
  }
  
  if (req.params.id === 'undefined') {
    req.params.id = null;
    console.log('   ⚠️  Fixed: Changed undefined param to null');
  }
  
  // Log query parameters
  if (Object.keys(req.query).length > 0) {
    console.log('   Query params:', req.query);
  }
  
  // Log body for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    console.log('   Request body:', JSON.stringify(req.body, null, 2));
  }
  
  next();
};

/**
 * Response interceptor to ensure consistent API responses
 */
exports.apiResponseFormatter = (req, res, next) => {
  // Store the original json method
  const originalJson = res.json;
  
  // Override the json method
  res.json = function(data) {
    // Ensure we don't double-wrap responses that are already formatted
    if (data && data.success !== undefined && data.timestamp !== undefined) {
      // Data is already formatted, pass it through
      return originalJson.call(this, data);
    }
    
    // Format the response
    const formattedData = {
      success: data && data.success !== undefined ? data.success : true,
      message: data && data.message ? data.message : 'Request successful',
      data: data && data.data !== undefined ? data.data : data,
      timestamp: new Date().toISOString()
    };
    
    // Add pagination if present
    if (data && data.pagination) {
      formattedData.pagination = data.pagination;
    }
    
    // Add meta data if present
    if (data && data.meta) {
      formattedData.meta = data.meta;
    }
    
    return originalJson.call(this, formattedData);
  };
  
  next();
};