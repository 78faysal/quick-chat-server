const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;


//middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jq69c8i.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("Quick-Chat").collection("users");
    const chatCollection = client.db("Quick-Chat").collection("chats");

    // users api
    app.get("/users/friends", async (req, res) => {
      const currentEmail = req.query.email;
      const message = req.query.message;
      const emailFilter = { email: currentEmail };
      const user = await userCollection.findOne(emailFilter);

      if (currentEmail && message) {
        if (user?.friends) {
          const lastChats = [];
          for (const friend of user.friends) {
            if (friend?.email) {
              const targetedEmail = friend?.email;
              const combinedFilter = {
                $or: [
                  { from: currentEmail, to: targetedEmail },
                  { from: targetedEmail, to: currentEmail },
                ],
              };
              const chatData = await chatCollection
                .find(combinedFilter)
                .toArray();
              const lastContent = chatData.slice(-1)[0].content;
              lastChats.push(lastContent);
            }
          }
          return res.send({ friends: user?.friends, lastChats });
        }
      }
      res.send({ friends: user?.friends });
    });

    app.get("/get-user-by/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const filter = { _id: new ObjectId(id) };
      const user = await userCollection.findOne(filter);
      res.send(user);
    });

    app.get("/user/all-requests", async (req, res) => {
      const email = req.query?.email;
      const filter = { email: email };
      const user = await userCollection.findOne(filter);
      const friends = user?.friends?.filter(
        (friend) =>
          friend?.sender !== true &&
          friend.status !== "confirm" &&
          friend.status !== "cancel"
      );
      res.send(friends);
    });

    app.get("/users-by-name", async (req, res) => {
      const name = req.query?.name;
      let filter = {};
      if (name && name?.length > 0) {
        filter = { name: { $regex: new RegExp(name, "i") } };
        const userWithMatchedName = await userCollection.find(filter).toArray();
        // console.log(userWithMatchedName);
        return res.send(userWithMatchedName);
      } else {
        return;
      }
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/user/add-friend", async (req, res) => {
      const { currentEmail, userInfo } = req.body;
      const requesterFilter = { email: currentEmail };
      const userFilter = { email: userInfo?.email };
      const requester = await userCollection.findOne(requesterFilter);
      const user = await userCollection.findOne(userFilter);
      // console.log(userInfo, user);

      if (user && requester) {
        if (!requester.friends) {
          requester.friends = [];
        }
        if (!user.friends) {
          user.friends = [];
        }
        requester.friends.push({
          _id: user._id,
          name: user.name,
          email: user.email,
          photo: user.photo,
          sender: true,
          status: "pending",
        });
        user.friends.push({
          _id: requester._id,
          name: requester.name,
          email: requester.email,
          photo: requester.photo,
          status: "pending",
        });
        const requesterUpdatedDoc = {
          $set: {
            friends: requester.friends,
          },
        };
        const userUpdatedDoc = {
          $set: {
            friends: user.friends,
          },
        };
        const updateRequester = await userCollection.updateOne(
          requesterFilter,
          requesterUpdatedDoc
        );
        const updateUser = await userCollection.updateOne(
          userFilter,
          userUpdatedDoc
        );
        res.status(200).send({ requestSend: "successfull" });
      }
    });

    app.patch("/user/status", async (req, res) => {
      const { currentEmail, targetedEmail, status } = req.body;
      // console.log(req.body);
      const currentEmailFilter = { email: currentEmail };
      const targetedEmailFilter = { email: targetedEmail };

      const currentUser = await userCollection.findOne(currentEmailFilter);
      const targetedUser = await userCollection.findOne(targetedEmailFilter);

      if (currentUser && targetedUser) {
        const currentUserFriends = currentUser.friends;
        const targetedUserFriends = targetedUser.friends;

        if (status) {
          const updatedCurrentUserFriends = currentUserFriends.map((friend) => {
            if (friend.email === targetedUser.email) {
              return { ...friend, status: status };
            } else {
              return friend;
            }
          });

          const updatedTargetedUserFriends = targetedUserFriends.map(
            (friend) => {
              if (friend.email === currentUser.email) {
                return { ...friend, status: status };
              } else {
                return friend;
              }
            }
          );

          const currentUserUpdatedDoc = {
            $set: {
              friends: updatedCurrentUserFriends,
            },
          };
          const targetedUserUpdatedDoc = {
            $set: {
              friends: updatedTargetedUserFriends,
            },
          };

          const updateCurrentUserStatus = await userCollection.updateOne(
            currentEmailFilter,
            currentUserUpdatedDoc
          );

          const updateTargetedUserStatus = await userCollection.updateOne(
            targetedEmailFilter,
            targetedUserUpdatedDoc
          );

          return res.send({
            updateCurrentUserStatus,
            updateTargetedUserStatus,
          });
        }
      }

      // console.log(currentUser.friends.status, targetedUser.friends.status);
    });

    app.patch("/users", async (req, res) => {
      const { displayName, photoURL, email } = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          name: displayName,
          email: email,
          photo: photoURL,
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // chats api
    app.get("/chats", async (req, res) => {
      const from = req.query.from;
      const to = req.query.to;
      const senderFilter = { from, to };
      const receiverFilter = { from: to, to: from };
      const combinedFilter = {
        $or: [
          { from, to },
          { from: to, to: from },
        ],
      };
      // const senderChatData = await chatCollection.find(senderFilter).toArray();
      const chatData = await chatCollection.find(combinedFilter).toArray();
      // console.log(receiverChatData);
      // res.send({senderChatData, receiverChatData});
      res.send(chatData);
    });

    app.post("/chats", async (req, res) => {
      const message = req.body;
      const result = await chatCollection.insertOne(message);
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Quick Chat server running ");
});

app.listen(port, () => {
  console.log("quick chat server is in", port);
});
