const express = require('express');

const http = require("http");
const setupScannerSocket = require("./socket/scannerSocket");

require('dotenv').config()
const app = express();
const server = http.createServer(app);

const io = setupScannerSocket(server);

const path = require("path");
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.set('trust proxy', true);
const cors =require('cors')
const bodyParser = require('body-parser');
app.use(cors({
  origin: true,
  credentials: true
}));

const mongoose = require("mongoose");
const config=require(`${__dirname}/config/configDB`);



config.connectDB(process.env.DATABASE);

const userRoute=require(`${__dirname}/routes/users/Auth`);
const settings=require(`${__dirname}/routes/settings/information`);
const expenceRoute=require(`${__dirname}/routes/expense`)
const admins =require(`${__dirname}/routes/users/admin`);
const customers=require(`${__dirname}/routes/people/customer`);
const suppliers=require(`${__dirname}/routes/people/supplier`);
const productRoute =require(`${__dirname}/routes/product/product`);
const invoiceRoute =require(`${__dirname}/routes/invoices/invoice`);
const returnRoute=require(`${__dirname}/routes/invoices/return`);
const purchaseRoute=require(`${__dirname}/routes/purchase/purchase`);
const dashboard =require(`${__dirname}/routes/dashboard/dash`)
const report =require(`${__dirname}/routes/report/report`)
const paymentDashboard =require(`${__dirname}/routes/dashboard/paymnet`)
const backupRoutes=require(`${__dirname}//backups/backup`)

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



app.use('/v1/users',userRoute);
app.use("/v1/settings",settings)
app.use('/v1/expense',expenceRoute);
app.use("/v1/admins",admins)
app.use('/v1/customers',customers);
app.use('/v1/suppliers',suppliers);
app.use('/v1/product',productRoute);
app.use('/v1/invoice',invoiceRoute);
app.use('/v1/salesReturn',returnRoute);
app.use('/v1/purchase',purchaseRoute);
app.use('/v1/dashboard',dashboard);
app.use('/v1/paymentDashboard',paymentDashboard);
app.use('/v1/reports',report);
app.use("/v1/", backupRoutes);










const PORT=process.env.PORT || 5000;
server.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
})
