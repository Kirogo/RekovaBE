// services/assignmentService.js - UPDATED VERSION
class AssignmentService {
  constructor() {
    this.maxRetries = 3;
  }
  
  /**
   * Assign customers to officers based on loan type specialization
   */
  async assignCustomersToOfficers(options = {}) {
    const {
      loanType = null,
      limit = 50,
      excludeAssigned = true,
      supervisorId = null
    } = options;
    
    try {
      console.log(`Starting assignment for loan type: ${loanType || 'All'}`);
      
      // 1. Get available officers for the loan type
      const availableOfficers = await this.getAvailableOfficers(loanType);
      
      if (availableOfficers.length === 0) {
        console.log(`No officers available for loan type: ${loanType || 'any'}`);
        return { 
          success: true, 
          message: `No officers available for ${loanType || 'any loan type'}`, 
          assignments: [] 
        };
      }
      
      console.log(`Found ${availableOfficers.length} available officers`);
      
      // 2. Get unassigned customers
      const unassignedCustomers = await this.getUnassignedCustomers({
        loanType,
        limit: limit * availableOfficers.length, // Get enough for all officers
        excludeAssigned
      });
      
      if (unassignedCustomers.length === 0) {
        console.log('No unassigned customers available');
        return { 
          success: true, 
          message: 'No unassigned customers available', 
          assignments: [] 
        };
      }
      
      console.log(`Found ${unassignedCustomers.length} unassigned customers`);
      
      // 3. Distribute customers evenly
      const assignments = await this.distributeCustomers({
        customers: unassignedCustomers,
        officers: availableOfficers,
        supervisorId
      });
      
      if (assignments.length === 0) {
        console.log('No assignments made (possibly due to capacity limits)');
        return { 
          success: true, 
          message: 'No assignments made (capacity limits or type mismatch)', 
          assignments: [] 
        };
      }
      
      console.log(`Created ${assignments.length} assignment records`);
      
      // 4. Update database
      const results = await this.saveAssignments(assignments);
      
      const successfulAssignments = results.filter(r => r.success).length;
      
      return {
        success: true,
        message: `Assigned ${successfulAssignments} customers to ${availableOfficers.length} officers`,
        assignments: results
      };
      
    } catch (error) {
      console.error('Assignment error:', error);
      return {
        success: false,
        message: error.message,
        error: error.stack
      };
    }
  }
  
  /**
   * Get officers available for specific loan type
   * UPDATED: Now uses loanType (singular) not loanTypes
   */
  async getAvailableOfficers(loanType = null) {
    const User = require('../models/User');
    
    console.log(`Looking for officers specializing in: ${loanType || 'Any'}`);
    
    const query = {
      role: 'officer',
      isActive: true
    };
    
    // Filter by loan type if specified
    if (loanType) {
      query.loanType = loanType; // CHANGED from loanTypes: { $in: [loanType] }
    }
    
    const allOfficers = await User.find(query)
      .select('_id username firstName lastName loanType capacity assignedCustomers')
      .lean();
    
    console.log(`Found ${allOfficers.length} officers with matching specialization`);
    
    // Filter by capacity in JavaScript
    const availableOfficers = allOfficers.filter(officer => {
      const maxCapacity = officer.capacity?.maxCustomers || 50;
      const currentLoad = officer.capacity?.currentLoad || 0;
      const assignedCount = officer.assignedCustomers?.length || 0;
      const totalLoad = currentLoad + assignedCount;
      
      return totalLoad < maxCapacity;
    });
    
    // Sort by load (least loaded first)
    availableOfficers.sort((a, b) => {
      const loadA = (a.capacity?.currentLoad || 0) + (a.assignedCustomers?.length || 0);
      const loadB = (b.capacity?.currentLoad || 0) + (b.assignedCustomers?.length || 0);
      
      // Also consider assignment priority if set
      const priorityA = a.capacity?.assignmentPriority || 1;
      const priorityB = b.capacity?.assignmentPriority || 1;
      
      // Lower load and higher priority = better
      return (loadA * priorityA) - (loadB * priorityB);
    });
    
    console.log(`Available officers after capacity check: ${availableOfficers.length}`);
    
    return availableOfficers;
  }
  
  /**
   * Get unassigned customers
   */
  async getUnassignedCustomers(options = {}) {
    const { loanType = null, limit = 100, excludeAssigned = true } = options;
    const Customer = require('../models/Customer');
    
    const query = {
      isActive: true,
      loanBalance: { $gt: 0 }
    };
    
    // Filter by loan type
    if (loanType) {
      query.loanType = loanType;
    }
    
    // Exclude already assigned
    if (excludeAssigned) {
      query.assignedTo = { $in: [null, undefined] };
    }
    
    return Customer.find(query)
      .select('_id customerId name phoneNumber loanBalance arrears loanType')
      .sort({ arrears: -1, loanBalance: -1 }) // Prioritize high arrears
      .limit(limit)
      .lean();
  }
  
  /**
   * Distribute customers evenly among officers
   * FIXED: Now uses loanType (singular) not loanTypes
   */
  async distributeCustomers({ customers, officers, supervisorId }) {
    console.log(`Distributing ${customers.length} customers among ${officers.length} officers`);
    
    const assignments = [];
    const officerAssignments = {};
    const assignedCustomerIds = new Set();
    
    // Initialize tracking
    officers.forEach(officer => {
      const officerKey = officer._id.toString();
      officerAssignments[officerKey] = {
        officer,
        customers: [],
        count: 0,
        specialization: officer.loanType // CHANGED from loanTypes[0]
      };
    });
    
    // Group customers by loan type
    const customersByLoanType = {};
    customers.forEach(customer => {
      if (!customersByLoanType[customer.loanType]) {
        customersByLoanType[customer.loanType] = [];
      }
      customersByLoanType[customer.loanType].push(customer);
    });
    
    console.log('Customer distribution by loan type:');
    Object.entries(customersByLoanType).forEach(([type, custList]) => {
      console.log(`  ${type}: ${custList.length} customers`);
    });
    
    // Distribute by loan type
    for (const [loanType, typeCustomers] of Object.entries(customersByLoanType)) {
      
      // Get officers specialized in this loan type
      // FIXED: Now checking officer.loanType instead of officer.loanTypes.includes()
      const specializedOfficers = officers.filter(o => o.loanType === loanType);
      
      if (specializedOfficers.length === 0) {
        console.log(`⚠️ No officers specialized in ${loanType}. Skipping ${typeCustomers.length} customers.`);
        continue;
      }
      
      console.log(`Distributing ${typeCustomers.length} ${loanType} customers to ${specializedOfficers.length} officers`);
      
      // Round-robin distribution within this loan type
      let officerIndex = 0;
      
      for (const customer of typeCustomers) {
        if (assignedCustomerIds.has(customer._id.toString())) {
          continue;
        }
        
        const officer = specializedOfficers[officerIndex];
        const officerKey = officer._id.toString();
        
        // Check capacity
        const currentLoad = officerAssignments[officerKey].count;
        const maxCapacity = officer.capacity?.maxCustomers || 50;
        const existingAssignments = officer.assignedCustomers?.length || 0;
        
        if ((currentLoad + existingAssignments) >= maxCapacity) {
          console.log(`Officer ${officer.username} at capacity, moving to next officer...`);
          officerIndex = (officerIndex + 1) % specializedOfficers.length;
          continue;
        }
        
        // Add assignment
        officerAssignments[officerKey].customers.push(customer);
        officerAssignments[officerKey].count++;
        assignedCustomerIds.add(customer._id.toString());
        
        assignments.push({
          customerId: customer._id,
          officerId: officer._id,
          loanType: customer.loanType,
          assignedBy: supervisorId,
          assignedAt: new Date(),
          customerName: customer.name,
          officerName: officer.username
        });
        
        // Move to next officer (round-robin)
        officerIndex = (officerIndex + 1) % specializedOfficers.length;
      }
    }
    
    console.log(`Total assignments created: ${assignments.length}`);
    return assignments;
  }
  
  /**
   * Save assignments to database
   */
  async saveAssignments(assignments) {
    const Customer = require('../models/Customer');
    const User = require('../models/User');
    
    const results = [];
    
    for (const assignment of assignments) {
      try {
        // First validate: Officer should specialize in this loan type
        const officer = await User.findById(assignment.officerId).select('loanType');
        if (!officer) {
          throw new Error(`Officer ${assignment.officerId} not found`);
        }
        
        if (officer.loanType !== assignment.loanType) {
          throw new Error(
            `Officer ${officer.username} specializes in ${officer.loanType}, ` +
            `cannot be assigned ${assignment.loanType} customer`
          );
        }
        
        // Update customer
        const updatedCustomer = await Customer.findByIdAndUpdate(
          assignment.customerId,
          {
            $set: { assignedTo: assignment.officerId },
            $push: {
              assignmentHistory: {
                officerId: assignment.officerId,
                assignedAt: assignment.assignedAt,
                assignedBy: assignment.assignedBy,
                reason: 'Automatic assignment by system'
              }
            }
          },
          { new: true }
        );
        
        if (!updatedCustomer) {
          throw new Error(`Customer ${assignment.customerId} not found`);
        }
        
        // Update officer
        await User.findByIdAndUpdate(
          assignment.officerId,
          {
            $addToSet: { assignedCustomers: assignment.customerId },
            $inc: { 'capacity.currentLoad': 1 }
          }
        );
        
        results.push({
          customerId: assignment.customerId,
          officerId: assignment.officerId,
          customerName: updatedCustomer.name,
          officerName: assignment.officerName,
          loanType: assignment.loanType,
          success: true,
          message: `Assigned ${updatedCustomer.name} to ${assignment.officerName}`
        });
        
        console.log(`✓ Assigned ${updatedCustomer.name} to ${assignment.officerName}`);
        
      } catch (error) {
        console.error(`Failed to assign customer ${assignment.customerId}:`, error.message);
        results.push({
          customerId: assignment.customerId,
          officerId: assignment.officerId,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

/**
 * Check for duplicate assignments
 * A real duplicate is when a customer is assigned to MULTIPLE officers
 */
async checkForDuplicates() {
  const Customer = require('../models/Customer');
  
  // Find customers assigned to multiple officers (REAL duplicates)
  const realDuplicates = await Customer.aggregate([
    {
      $match: {
        assignedTo: { $ne: null, $exists: true }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'assignedTo',
        foreignField: '_id',
        as: 'officerInfo'
      }
    },
    {
      $unwind: '$officerInfo'
    },
    // Group by customer to find duplicates
    {
      $group: {
        _id: '$_id',
        customerName: { $first: '$name' },
        customerId: { $first: '$customerId' },
        assignedOfficers: { $push: '$officerInfo.username' },
        officerCount: { $sum: 1 }
      }
    },
    {
      $match: {
        officerCount: { $gt: 1 } // REAL duplicate: customer assigned to >1 officer
      }
    }
  ]);
  
  // Also check for customers in multiple officers' assignedCustomers arrays
  const User = require('../models/User');
  const allOfficers = await User.find({ role: 'officer' })
    .select('username assignedCustomers')
    .lean();
  
  const customerOfficerMap = {};
  allOfficers.forEach(officer => {
    officer.assignedCustomers?.forEach(customerId => {
      if (!customerOfficerMap[customerId.toString()]) {
        customerOfficerMap[customerId.toString()] = [];
      }
      customerOfficerMap[customerId.toString()].push(officer.username);
    });
  });
  
  const arrayDuplicates = Object.entries(customerOfficerMap)
    .filter(([_, officers]) => officers.length > 1)
    .map(([customerId, officers]) => ({
      customerId,
      officers,
      officerCount: officers.length
    }));
  
  return {
    realDuplicates, // Customers assigned to >1 officer in assignedTo field
    arrayDuplicates, // Customers in multiple officers' assignedCustomers arrays
    summary: {
      realDuplicateCount: realDuplicates.length,
      arrayDuplicateCount: arrayDuplicates.length,
      totalIssues: realDuplicates.length + arrayDuplicates.length
    }
  };
}
  
  /**
   * Reassign customer to different officer
   */
  async reassignCustomer(customerId, newOfficerId, reason = 'Manual reassignment', supervisorId) {
    const Customer = require('../models/Customer');
    const User = require('../models/User');
    
    // Get current assignment
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }
    
    const oldOfficerId = customer.assignedTo;
    
    // Validate new officer specialization
    const newOfficer = await User.findById(newOfficerId).select('loanType');
    if (!newOfficer) {
      throw new Error('New officer not found');
    }
    
    if (newOfficer.loanType !== customer.loanType) {
      throw new Error(
        `Officer ${newOfficer.username} specializes in ${newOfficer.loanType}, ` +
        `cannot handle ${customer.loanType} customer`
      );
    }
    
    // Remove from old officer
    if (oldOfficerId) {
      await User.findByIdAndUpdate(oldOfficerId, {
        $pull: { assignedCustomers: customerId },
        $inc: { 'capacity.currentLoad': -1 }
      });
    }
    
    // Add to new officer
    await User.findByIdAndUpdate(newOfficerId, {
      $addToSet: { assignedCustomers: customerId },
      $inc: { 'capacity.currentLoad': 1 }
    });
    
    // Update customer
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      {
        assignedTo: newOfficerId,
        $push: {
          assignmentHistory: {
            officerId: newOfficerId,
            assignedAt: new Date(),
            assignedBy: supervisorId,
            reason: reason
          }
        }
      },
      { new: true }
    );
    
    return {
      success: true,
      customerId,
      oldOfficerId,
      newOfficerId,
      customer: updatedCustomer,
      message: `Reassigned ${customer.name} from ${oldOfficerId || 'unassigned'} to ${newOfficer.username}`
    };
  }
  
  /**
   * Get assignment statistics
   */
  async getAssignmentStats() {
    const Customer = require('../models/Customer');
    const User = require('../models/User');
    
    const stats = await Customer.aggregate([
      {
        $facet: {
          totalCustomers: [
            { $match: { isActive: true } },
            { $count: 'count' }
          ],
          assignedCustomers: [
            { $match: { isActive: true, assignedTo: { $ne: null } } },
            { $count: 'count' }
          ],
          byLoanType: [
            { $match: { isActive: true } },
            {
              $group: {
                _id: '$loanType',
                total: { $sum: 1 },
                assigned: {
                  $sum: { $cond: [{ $ne: ['$assignedTo', null] }, 1, 0] }
                }
              }
            }
          ],
          byOfficer: [
            { $match: { isActive: true, assignedTo: { $ne: null } } },
            {
              $group: {
                _id: '$assignedTo',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ]
        }
      }
    ]);
    
    return stats[0];
  }
}

module.exports = new AssignmentService();