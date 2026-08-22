const express = require('express');
const router = express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
const expenseController = require(`${__dirname}/../controllers/expense/expense`);

// protected routes
router.use(authMiddleware.protected);
router.use(authorizationMiddleware.role('superadmin', 'manager')); 
// CREATE
router.post('/', expenseController.createExpense);

// GET ALL
router.get('/', expenseController.getAllExpenses);

// get current
router.get('/getCurrentExpenses', expenseController.getCurrentExpenses);


// GET BY ID
router.get('/:id', expenseController.getExpenseById);

// UPDATE
router.put('/:id', expenseController.updateExpense);

// DELETE
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;