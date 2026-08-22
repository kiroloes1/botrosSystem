const mongoose = require("mongoose");
const fs = require("fs");
require("dotenv").config();

// Models
const Customer = require("./models/people/customer");
const Supplier = require("./models/people/supplier");
const Product = require("./models/products");
const Expense = require("./models/expense");

// MongoDB URL
const MONGO_URI = process.env.DATABASE;

// ===============================
// Insert Data In Chunks
// ===============================
async function insertInChunks(Model, data, name, chunkSize = 1000) {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);

    try {
      await Model.insertMany(chunk, {
        ordered: false
      });

      const inserted = Math.min(i + chunkSize, data.length);

      console.log(
        `${name}: ${inserted}/${data.length} imported`
      );

    } catch (error) {
      console.error(
        `${name} chunk ${i} - ${i + chunk.length} Error:`,
        error.message
      );
    }
  }
}

// ===============================
// Import
// ===============================
async function importData() {
  try {

    if (!MONGO_URI) {
      throw new Error(
        "DATABASE is not defined in .env file"
      );
    }

    // Connect MongoDB
    await mongoose.connect(MONGO_URI);

    console.log("MongoDB Connected");

    // ===============================
    // Read JSON files
    // ===============================

    const customers = JSON.parse(
      fs.readFileSync("./data/customer.json", "utf8")
    );

    const suppliers = JSON.parse(
      fs.readFileSync("./data/supplier.json", "utf8")
    );

    const products = JSON.parse(
      fs.readFileSync("./data/product.json", "utf8")
    );

    const expenses = JSON.parse(
      fs.readFileSync("./data/expense.json", "utf8")
    );

    console.log("\nData Loaded:");
    console.log("Customers:", customers.length);
    console.log("Suppliers:", suppliers.length);
    console.log("Products:", products.length);
    console.log("Expenses:", expenses.length);

    // ===============================
    // Import
    // ===============================

    await insertInChunks(
      Customer,
      customers,
      "Customers",
      1000
    );

    await insertInChunks(
      Supplier,
      suppliers,
      "Suppliers",
      1000
    );

    await insertInChunks(
      Product,
      products,
      "Products",
      1000
    );

    await insertInChunks(
      Expense,
      expenses,
      "Expenses",
      1000
    );

    console.log("\nAll Data Imported Successfully");

    await mongoose.disconnect();

    process.exit(0);

  } catch (error) {

    console.error("Import Error:", error);

    await mongoose.disconnect();

    process.exit(1);
  }
}

importData();