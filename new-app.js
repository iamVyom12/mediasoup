import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import mediasoup from "mediasoup";
import http from "http";
import { Server } from "socket.io";
import Room from "./Room.js";
import User from "./User.js";

const app = express();
const rooms = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const server = http.createServer(app);
const io = new Server(server);
const worker = await mediasoup.createWorker();

app.use(express.static(path.resolve(__dirname, "./public")));
app.use(express.static(path.resolve(__dirname, "./dist")));
app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "./public/chat-room.html"));
});

const ensureRoomJoined = (socket, next) => {
  if (socket.roomJoined) {
    next();
  } else {
    console.error("User not joined room");
  }
};

io.on("connection", (socket) => {
  socket.on("joinRoom", async ({ roomId }, callback) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, await Room.create(roomId, worker));
    }
    const room = rooms.get(roomId);
    const user = new User(socket,roomId);
    // console.log("user.id is" + user.id);
    room.addPeer(user);

    socket.emit("routerRtpCapabilities", room.getRouter().rtpCapabilities);

    // Send list of existing producerIds to the new user
    let producersIds = [];
    room.getProducers().forEach((producer) => {
      producersIds.push(producer.id);
    });

    socket.join(roomId);

    callback({ producersIds });
  });

  socket.on("createProducerTransport", async (roomId, callback) => {
    try {
      const room = rooms.get(roomId);
      const user = room.getPeer(socket.id);
      user
        .createProducerTransport(room.getRouter())
        .then((producerTransport) => {
          callback({
            id: producerTransport.id,
            iceParameters: producerTransport.iceParameters,
            iceCandidates: producerTransport.iceCandidates,
            dtlsParameters: producerTransport.dtlsParameters,
            sctpParameters: producerTransport.sctpParameters,
          });
          // console.log("producerTransportParams is " + producerTransport.id);
        });
    } catch (error) {
      console.error("Error creating producer transport:", error);
      callback({ error: error.message });
    }
  });

  socket.on("createConsumerTransport", async (roomId,callback) => {
    try{
      const room = rooms.get(roomId);
      const user = room.getPeer(socket.id);
      await user.createConsumerTransport(room.getRouter()).then((consumerTransport) => {
        callback({
          id: consumerTransport.id,
          iceParameters: consumerTransport.iceParameters,
          iceCandidates: consumerTransport.iceCandidates,
          dtlsParameters: consumerTransport.dtlsParameters,
          sctpParameters: consumerTransport.sctpParameters,
        });
        // console.log("consumerTransportParams is " + consumerTransport.id);
      });
    }catch (error) {
      console.error("Error creating consumer transport:", error);
      callback({ error: error.message });
    }
  });

  socket.on(
    "connectTransport",
    async ({ roomId, transportId, dtlsParameters }, callback) => {
      try {
        const room = rooms.get(roomId);
        if (!room) {
          return callback({ error: "Room not found" });
        }

        const user = room.getPeer(socket.id);
        if (!user) {
          return callback({ error: "User not found" });
        }

        const transport = [user.producerTransport, ...user.consumerTransports].find(
          (t) => t.id === transportId
        ); 

        // if(transport == user.producerTransport){
        //   console.log("Producer transport is being connected");
        // }else{
        //   console.log("Consumer transport is being connected");
        // }

        if (!transport) {
          return callback({ error: "Transport not found" });
        }

        await transport.connect({ dtlsParameters });
 
        callback();
      } catch (error) {
        console.error("Error connecting transport:", error);
        callback({ error: "Failed to connect transport" });
      }
    }
  );

  socket.on(
    "produce",
    async ({ roomId, transportId, kind, rtpParameters }, callback) => {
      try {
        const room = rooms.get(roomId);
        if (!room) {
          return callback({ error: "Room not found" });
        }

        const user = room.getPeer(socket.id);
        if (!user) {
          return callback({ error: "User not found" });
        }
        
        const transport = user.producerTransport;

        if (!transport || transport.id !== transportId) {
          return callback({ error: "Transport not found or mismatched" });
        }
    
        const producer = await user.producerTransport.produce({
          kind,
          rtpParameters,
        });
        
        producer.on("transportclose", () => {
          producer.close();
        });

        // console.log("Producer :" + producer.id + "is added for user :" + user.id);

        room.addProducer(producer);

        // Notify other peers in the room
        socket.to(roomId).emit("newProducer", {
          producerId: producer.id,
          peerId: user.id,
          kind,
        });

        callback({ id: producer.id });
      } catch (error) {
        console.error("Error creating producer:", error);
        callback({ error: "Failed to create producer" });
      }
    }
  );

  
socket.on(
  "consume",
  async ({ roomId,transportId , producerId, rtpCapabilities }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: "Room not found" });
    }

    const user = room.getPeer(socket.id);
    if (!user) {
      return callback({ error: "User not found" });
    }

    const producer = room.getProducer(producerId);
    if (!producer) {
      return callback({ error: "Producer not found" });
    }
    

    // console.log("RTP Capabilities codecs of producer are");
    // console.log(producer.rtpParameters.codecs);

    const router = room.getRouter();
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      return callback({ error: "cannot consume" });
    }

    const transport = user.consumerTransports.find((t) => t.id === transportId);

    // console.log("consumerTransport is");
    // console.log(transport.id);

    // console.log("RTP Capabilities of client are");
    // console.log(rtpCapabilities.codecs);

    
    const consumer = await transport.consume(
      {
        producerId : producer.id,
        rtpCapabilities,
        paused: true,
      }
    );

    // console.log("Consumer RTP Parameters codecs are");
    // console.log(consumer.rtpParameters.codecs);
    // console.log(consumer.kind);

    consumer.on("transportclose", () => {
      console.log("Transport close");
      consumer.close();
    });

    consumer.on("producerclose", () => {
      console.log("Producer close");
    });

    user.addConsumer(consumer);


    callback({
      id: consumer.id,
      producerId: producerId,
      kind: consumer.kind,
      paused: true,
      rtpParameters: consumer.rtpParameters,
    });
  }
);

  
  socket.on("resumeConsumer", async ({ roomId,consumerId }, callback) => {

    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: "Room not found" });
    }

    const user = room.getPeer(socket.id);
    if (!user) {
      return callback({ error: "User not found" });
    }

    // user.consumers.forEach(consumer => console.log(consumer.id))

    // console.log("recived consumerId : " ,consumerId);

    const consumer = user.getConsumer(consumerId);
    if (consumer) {
      await consumer.resume();
      callback();
    } else {
      callback({ error: "Consumer not found" });
    }

  });

  socket.on("leaveRoom", async ({ roomId , producerId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: "Room not found" });
    }

    room.removePeer(socket.id,producerId);

    if (room.getPeers().size === 0) {
      rooms.delete(roomId);
    }

  });

  socket.on("disconnect", () => {
    socket.leaveAll();
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});

