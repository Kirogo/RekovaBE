// routes/promiseRoutes.js
const express = require("express");
const router = express.Router();
const PromiseController = require("../controllers/promiseController");

console.log("🔧 Loading promise routes...");

// REMOVED: router.use(protect); // Let server.js handle authentication

// Main routes
router.get("/", (req, res) => PromiseController.getPromises(req, res));
router.post("/", (req, res) => PromiseController.createPromise(req, res));
router.get("/export", (req, res) => PromiseController.exportPromises(req, res));
router.get("/follow-up", (req, res) => PromiseController.getFollowUpPromises(req, res));
router.get("/customer/:customerId", (req, res) => PromiseController.getCustomerPromises(req, res));
router.patch("/:promiseId/status", (req, res) => PromiseController.updatePromiseStatus(req, res));

// Officer-specific promise routes
router.get("/my-promises", (req, res) => PromiseController.getMyPromises(req, res));
router.post("/my-promises", (req, res) => PromiseController.createMyPromise(req, res));

// Health check route
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Promise routes are working!",
    user: req.user ? req.user.username : "No user",
    timestamp: new Date().toISOString(),
  });
});

console.log("✅ Promise routes loaded successfully");

module.exports = router;