const express = require('express');
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const { role } = require(`${__dirname}/../../middlewares/authorization`);
const productController = require(`${__dirname}/../../controllers/products/products`);
const upload = require(`${__dirname}/../../middlewares/multer`);

const multer = require('multer');
const storage = multer.memoryStorage();
const uploads = multer({ storage: storage });

router.use(authMiddleware.protected);
router.use(role("superadmin", "admin"));

// =============================================
// GET ROUTES
// =============================================

// Get all products
router.get('/all', productController.getAllProducts);

// Search products
router.get('/search', productController.search);

// Get all categories
router.get('/categories/all', productController.filterProductBasedOnCategory);

// Get suggestion (autocomplete)
router.get('/suggestion', productController.suggestion);

// Export products
router.get('/data/export', productController.exportProducts);

// Get product by ID (Admin)
router.get('/getByIdForAdmin/:id', productController.getProductByIdAdmin);

// =============================================
// POST ROUTES
// =============================================

// Create product manually
router.post('/', productController.createProduct);

// Create products from Excel
router.post('/add-product-from-excel-sheets', uploads.single('file'), productController.createFromExcel);

// Upload product image
router.post('/:productId/upload-image', upload.single('image'), productController.uploadImageToProduct);

// =============================================
// PUT ROUTES
// =============================================

// Update product
router.put('/:productId', productController.updateProduct);

// =============================================
// DELETE ROUTES
// =============================================

// Delete product
router.delete('/:productId', productController.deleteProduct);

// Delete product image
router.delete('/:productId/delete-image', productController.deleteImageToProduct);

// Delete all products
router.delete('/', productController.deleteAllProducts);

module.exports = router;