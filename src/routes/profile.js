const express = require("express");
const profileRouter = express.Router();
const { mongoose } = require("mongoose");
const { userAuth } = require("../middlewares/auth");
const User = require("../models/user");
const { validateProfileData } = require("../utils/validation");
const ConnectionRequest = require("../models/connectionRequest");
const { userRole } = require("../middlewares/role");

//* To view ourself profile
profileRouter.get("/profile/view", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    res.status(200).json({
      success: true,
      message: "Profile Data Fetched",
      user: loggedInUser,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

//* To edit fields in profile
profileRouter.patch("/profile/edit", userAuth, async (req, res) => {
  try {
    // Validate profile data
    validateProfileData(req);

    const loggedInUser = req.user;

    // Update only allowed fields
    Object.keys(req.body).forEach(
      (field) => (loggedInUser[field] = req.body[field])
    );

    await loggedInUser.save();

    res.status(200).json({
      success: true,
      message: `${loggedInUser.firstName}, your profile has been updated`,
    });
  } catch (err) {
    console.error("Validation Error:", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

//* To delete profile/account
profileRouter.delete("/profile/delete", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    if (!loggedInUser) {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized. Please login again." });
    }
    const { password } = req.body;
    const isPasswordValid = await loggedInUser.validatePassword(password);
    if (isPasswordValid) {
      //! deleting all the connectionRequests

      const { deletedCount: noOfConnectionDeleted } =
        await ConnectionRequest.deleteMany({
          $or: [
            { fromUserId: loggedInUser._id },
            { toUserId: loggedInUser._id },
          ],
        });
      const { deletedCount } = await User.deleteOne({ _id: loggedInUser._id });

      if (deletedCount === 1) {
        res.status(200).json({
          success: true,
          message: `Account with username : ${loggedInUser.username} and email : ${loggedInUser.email} having total ${noOfConnectionDeleted} connection requests has been deleted`,
        });
      } else {
        throw new Error("Account has not deleted");
      }
    } else {
      throw new Error("Password is incorrect");
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

//* To change status active/deactivated
profileRouter.patch("/profile/changeStatus", userAuth, async (req, res) => {
  try {
    //* storing logged user data
    const loggedInUser = req.user;

    if (!loggedInUser) {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized. Please login again." });
    }

    const { status, password } = req.body;

    //* Validating password
    const isPasswordValid = await loggedInUser.validatePassword(password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid password. Please try again." });
    }

    //* Handle if `status` is banned
    if (loggedInUser.status === "banned") {
      return res.status(403).json({
        success: false,
        message: `${loggedInUser.firstName}, your account has been banned. Contact admin for more details.`,
      });
    }
    if (status === "banned") {
      return res.status(403).json({
        message: `${loggedInUser.firstName}, you need to be an admin or moderator to ban a loggedInUser.`,
      });
    }

    //* Ensure `status` is valid
    if (!["active", "deactivated"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Invalid status. Use 'active' or 'deactivated'." });
    }

    //* Handle status change logic
    if (loggedInUser.status === status) {
      const message =
        status === "active"
          ? "Your account is already active."
          : "Your account is already deactivated.";
      return res.status(200).json({ success: true, message });
    }

    //* Update the loggedInUser's status
    loggedInUser.status = status;
    await loggedInUser.save();
    const message =
      status === "active"
        ? "Your account has been reactivated."
        : "Your account has been deactivated.";
    return res.status(200).json({ success: true, message });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

//* To view Someone profile
profileRouter.get("/profile/:userId", async (req, res) => {
  try {
    //* storing userId from params
    const { userId } = req.params;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, error: "Username must be provided" });
    }

    //* finding if user present in collection
    const user = await User.findOne({ username: userId });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: `${user.firstName}'s profile data fetched`,
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

//* Admin routes

//* To change the role to admin, moderator or user
profileRouter.patch(
  "/admin/changeRole/:role/:userId",
  userAuth,
  userRole("admin"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { role, userId } = req.params;

      //* Checking if userId exist in user database
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const isUserExist = await User.findById(userId);
        if (!isUserExist) {
          return res.status(400).json({ error: "Invalid user ID" });
        }
      } else {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      //* array of roles allowed to update
      const allowedRole = ["admin", "moderator", "user"];

      if (!allowedRole.includes(role)) {
        return res.status(400).json({ error: `invalid Role ${role}` });
      }

      //* finding user
      const user = await User.findById(userId);

      //* checking if user is admin
      const adminEmails = process.env.adminEmails
        ? process.env.adminEmails.split(",")
        : [];
      if (adminEmails.includes(user.email)) {
        return res.status(400).json({
          error: `Role of ${
            user.firstName[0].toUpperCase() + user.firstName.slice(1)
          } could not be update.`,
        });
      }

      //* if role is same as previous role
      if (user.role === role) {
        return res.status(400).json({
          error: `${
            user.firstName[0].toUpperCase() + user.firstName.slice(1)
          } already have ${role} role`,
        });
      }

      //* updating role
      user.role = role;
      await user.save();

      res.status(200).json({
        message: `Role of ${
          user.firstName[0].toUpperCase() + user.firstName.slice(1)
        } is updated to ${role}`,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

//* to view all admin, moderators and user
profileRouter.get(
  "/admin/viewRole/:role",
  userAuth,
  userRole("admin"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { role } = req.params;

      const allowedRole = ["admin", "moderator", "user"];

      if (!allowedRole.includes(role)) {
        return res.status(400).json({ error: `invalid Role ${role}` });
      }
      const page =
        parseInt(req.query.page) < 1 ? 1 : parseInt(req.query.page) || 1;
      let limit =
        parseInt(req.query.limit) > 50
          ? 50
          : parseInt(req.query.limit) < 1
          ? 1
          : parseInt(req.query.limit) || 10;

      const list = await User.find({ role: role })
        .select(process.env.ALLOWED_FIELDS.split(","))
        .skip((page - 1) * limit)
        .limit(limit);

      res.status(200).json({
        message: `Data retrieved`,
        list,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

//* to change status active, deactivated or block
profileRouter.patch(
  "/admin/changeStatus/:status/:userId",
  userAuth,
  userRole("admin"),
  async (req, res) => {
    try {
      //* storing logged user data
      const loggedInUser = req.user;

      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { status, userId } = req.params;

      //* Checking if userId exist in user database
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const isUserExist = await User.findById(userId);
        if (!isUserExist) {
          return res.status(400).json({ error: "Invalid user ID" });
        }
      } else {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await User.findById(userId);

      //* Ensure `status` is valid
      if (!["active", "deactivated", "banned"].includes(status)) {
        return res.status(400).json({ error: "Invalid status." });
      }

      //* Handle status change logic
      if (user.status === status) {
        return res
          .status(200)
          .json({ message: `User's account is already ${status}` });
      }

      //* Update the user's status
      user.status = status;
      await user.save();
      return res
        .status(200)
        .json({ message: `User's account is has been updated to ${status}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

//* to delete user profile
profileRouter.delete(
  "/admin/user/delete/:userId",
  userAuth,
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { userId } = req.params;
      //* Checking if userId exist in user database
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const isUserExist = await User.findById(userId);
        if (!isUserExist) {
          return res.status(400).json({ error: "Invalid user ID" });
        }
      } else {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await User.findById(userId);

      if (user.role === "admin") {
        return res.status(400).json({
          message: `Admin Profile could not be deleted.`,
        });
      }

      //! deleting all the connectionRequests
      const { deletedCount: noOfConnectionDeleted } =
        await ConnectionRequest.deleteMany({
          $or: [{ fromUserId: userId }, { toUserId: userId }],
        });

      const { deletedCount } = await User.deleteOne({ _id: userId });

      if (deletedCount === 1) {
        res.status(200).json({
          message: `Account with username : ${user.username} and email : ${user.email} having total ${noOfConnectionDeleted} connection requests has been deleted`,
        });
      } else {
        throw new Error("Account has not deleted");
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

//* To view all the users (admin)
profileRouter.get(
  "/admin/feed",
  userAuth,
  userRole("admin"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const users = await User.find();

      if (users.length === 0) {
        return res.status(404).json({ error: "0 user exist" });
      }
      res.status(200).json({ message: users });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

//* Moderator routes

//* to change the role to moderator or user
profileRouter.patch(
  "/moderator/changeRole/:role/:userId",
  userAuth,
  userRole("admin", "moderator"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { role, userId } = req.params;

      //* Checking if userId exist in user database
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const isUserExist = await User.findById(userId);
        if (!isUserExist) {
          return res.status(400).json({ error: "Invalid user ID" });
        }
      } else {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      //* checking if loggedInUser === userId
      if (loggedInUser._id.equals(userId)) {
        return res.status(400).json({ error: "You could not change your oun" });
      }

      //* array of roles allowed to update
      const allowedRole = ["moderator", "user"];

      if (!allowedRole.includes(role)) {
        return res.status(400).json({ error: `invalid Role ${role}` });
      }

      //* finding user
      const user = await User.findById(userId);

      //* checking if user is admin
      const adminEmails = process.env.adminEmails
        ? process.env.adminEmails.split(",")
        : [];
      if (adminEmails.includes(user.email)) {
        return res.status(400).json({
          error: `Role of ${
            user.firstName[0].toUpperCase() + user.firstName.slice(1)
          } could not be update.`,
        });
      }

      if (user.role === "admin") {
        return res.status(400).json({
          message: `Admin role could not be changed. If you are admin try admin api.`,
        });
      }

      //* checking if new role is same as previous
      if (user.role === role) {
        return res.status(400).json({
          message: `${
            user.firstName[0].toUpperCase() + user.firstName.slice(1)
          } already have ${role} role`,
        });
      }

      //* updating role
      user.role = role;
      await user.save();

      res.status(200).json({
        message: `Role of ${
          user.firstName[0].toUpperCase() + user.firstName.slice(1)
        } is updated to ${role}`,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

//* to view all moderators and user
profileRouter.get(
  "/moderator/viewRole/:role",
  userAuth,
  userRole("admin", "moderator"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { role } = req.params;

      const allowedRole = ["moderator", "user"];

      if (!allowedRole.includes(role)) {
        return res.status(400).json({
          error: `Could not access ${role} list. If your are admin try admin api.`,
        });
      }

      const page =
        parseInt(req.query.page) < 1 ? 1 : parseInt(req.query.page) || 1;
      let limit =
        parseInt(req.query.limit) > 50
          ? 50
          : parseInt(req.query.limit) < 1
          ? 1
          : parseInt(req.query.limit) || 10;

      const list = await User.find({ role: role })
        .select(process.env.ALLOWED_FIELDS.split(","))
        .skip((page - 1) * limit)
        .limit(limit);

      res.status(200).json({
        message: `Data retrieved`,
        list,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

//* to get the number of all, active, deactivated or banned user
profileRouter.get(
  "/moderator/userNumbers/:status",
  userAuth,
  userRole("admin", "moderator"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { status } = req.params;
      const allowedStatus = ["all", "active", "deactivated", "banned"];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({
          error: `Invalid status : ${status}`,
        });
      }
      let userNumbers;
      if (status === "all") {
        userNumbers = await User.countDocuments();
      } else {
        userNumbers = await User.countDocuments({ status });
      }

      res.status(200).json({
        message: `Data retrieved`,
        userNumbers,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

//* to view profiles of all, active, deactivated or banned user
profileRouter.get(
  "/moderator/viewUsers/:status",
  userAuth,
  userRole("admin", "moderator"),
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      if (!loggedInUser) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized. Please login again.",
        });
      }

      const { status } = req.params;
      const allowedStatus = ["all", "active", "deactivated", "banned"];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status : ${status}`,
        });
      }

      let list;
      const page =
        parseInt(req.query.page) < 1 ? 1 : parseInt(req.query.page) || 1;
      let limit =
        parseInt(req.query.limit) > 50
          ? 50
          : parseInt(req.query.limit) < 1
          ? 1
          : parseInt(req.query.limit) || 10;

      // Determine sorting order (default to descending by createdAt)
      const sortBy = req.query.sortBy || "createdAt";
      const sortOrder = req.query.sortOrder || "desc";
      const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      // Query users based on status and apply sorting
      if (status === "all") {
        list = await User.find()
          .select(process.env.ALLOWED_FIELDS.split(","))
          .sort(sortOptions)
          .skip((page - 1) * limit)
          .limit(limit);
      } else {
        list = await User.find({ status })
          .select(process.env.ALLOWED_FIELDS.split(","))
          .sort(sortOptions)
          .skip((page - 1) * limit)
          .limit(limit);
      }

      res.status(200).json({
        success: true,
        message: "Data retrieved",
        users: list,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);


//* To change status active and deactivated
profileRouter.patch(
  "/moderator/changeStatus/:status/:userId",
  userAuth,
  userRole("admin", "moderator"),
  async (req, res) => {
    try {
      //* storing logged user data
      const loggedInUser = req.user;

      if (!loggedInUser) {
        return res
          .status(401)
          .json({ error: "Unauthorized. Please login again." });
      }

      const { status, userId } = req.params;

      //* Checking if userId exist in user database
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const isUserExist = await User.findById(userId);
        if (!isUserExist) {
          return res.status(400).json({ error: "Invalid user ID" });
        }
      } else {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await User.findById(userId);

      //* Ensure `status` is valid
      if (!["active", "deactivated"].includes(status)) {
        return res.status(400).json({ error: "Invalid status." });
      }

      if (user.role === "admin") {
        return res.status(400).json({
          message: `Admin status could not be changed. If you are admin try admin api.`,
        });
      }

      //* Handle status change logic
      if (user.status === status) {
        return res
          .status(200)
          .json({ message: `User's account is already ${status}` });
      }

      //* Update the user's status
      user.status = status;
      await user.save();
      return res
        .status(200)
        .json({ message: `User's account is has been updated to ${status}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = profileRouter;
