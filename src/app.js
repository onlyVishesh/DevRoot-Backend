const cors = require("cors");
const express = require("express");
const { connectDB } = require("./config/database");
const app = express();
const cookieParser = require("cookie-parser");
require("dotenv").config();
require("./utils/cronjob");
const http = require("http");
const { Server } = require("socket.io");

//* Middleware to parse incoming JSON requests and cookies
app.use(cors({ origin: process.env.FrontendURL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

//* Routes for different API endpoints
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/request");
const userRouter = require("./routes/userConnection");
const searchRouter = require("./routes/search");
const paymentRoute = require("./routes/payment");
const chatRoute = require("./routes/chat");
const initializeSocket = require("./utils/socket");

//* Using routers for handling different routes
app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", userRouter);
app.use("/", searchRouter);
app.use("/", paymentRoute);
app.use("/", chatRoute);

const server = http.createServer(app);

initializeSocket(server);

//* Connect to the database and start the server once connected
const PORT = process.env.PORT || 3001;
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}...`);
    });
  })
  .catch((err) => console.error(err));
