console.log("new-chat-room.js loaded");

import mediasoup from "mediasoup-client";
import io from "socket.io-client";
let videoIdCounter = 0;

const socket = io();
const device = new mediasoup.Device();
let routerRtpCapabilities;
//temp roomId
let roomId = "test"; //hard coded for now
let params = {
  encoding: [
    {
      rid: "r0",
      maxBitrate: 100000,
      scaleResolutionDownBy: 10.0,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r1",
      maxBitrate: 300000,
      scaleResolutionDownBy: 4.0,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r2",
      maxBitrate: 900000,
      scaleResolutionDownBy: 2.0,
      scalabilityMode: "S1T3",
    },
  ],
  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
}; //to hold my mediasoup parameters
let videoParams = {
  track: null,
  ...params,
};
let audioParams = {
  track: null,
};
let producerTransport;
let consumerTransport = new Map();
let videoProducer;
let videoProducerId;
let audioProducer;
let consumers = new Map();

let startvideo = async () => {
  const video = document.getElementsByClassName("local-video")[0];
  await navigator.mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then((stream) => {
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      videoParams.track = track;
      audioParams.track = audioTrack;
      document
        .getElementById("videoButton")
        .addEventListener("click", async () => {
          //toggle video on/off
          track.enabled = !track.enabled;
        });
    })
    .catch((err) => console.log(err.message));
};

async function joinRoom(roomId) {
  socket.emit("joinRoom", { roomId }, ({ producersIds }) => {
    console.log("existing producers");
    console.log(producersIds);
    createTransport("createProducerTransport").then(
      async (producerTransportParam) => {
        // console.log("id : " + producerTransportParam.id);
        producerTransport = device.createSendTransport(producerTransportParam);
        // console.log(producerTransport);
        setProducerEvents(producerTransport);

        // producer = producerTransport.produce(params);
        // console.log("producer processed");
        try {
          videoProducer = await producerTransport.produce(videoParams);
          // audioProducer = await producerTransport.produce(audioParams);
          videoProducer.on("trackended", () => {
            console.log("track ended");
          });
          // audioProducer.on("trackended", () => {
          //   console.log("track ended");
          // });
          connectExistingProducers(producersIds);
        } catch (error) {
          console.error("Error producing video:", error.message);
        }
      }
    );
  });

  socket.on("routerRtpCapabilities", async (data) => {
    try {
      routerRtpCapabilities = data;
      // console.log(routerRtpCapabilities);
      await device.load({ routerRtpCapabilities });
      // console.log(device.rtpCapabilities);
    } catch (error) {
      console.error(error);
    }
  });
}
async function createTransport(event) {
  return new Promise((resolve) => {
    socket.emit(event, roomId, (transportParams) => {
      // console.log("transportParams for" + event + "is " + transportParams.id);
      resolve(transportParams);
    });
  });
}

const setProducerEvents = (producerTransport) => {
  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      try {
        socket.emit(
          "connectTransport",
          { roomId, transportId: producerTransport.id, dtlsParameters },
          (error) => {
            if (error) {
              errback(error);
            } else {
              callback();
            }
          }
        );
      } catch (error) {
        console.error("Error connecting transport:", error);
        errback(error);
      }
    }
  );

  producerTransport.on(
    "produce",
    async ({ kind, rtpParameters }, callback, errback) => {
      try {
        // console.log("producerTransport id is " + producerTransport.id);
        socket.emit(
          "produce",
          { roomId, transportId: producerTransport.id, kind, rtpParameters },
          (producerId) => {
            if (producerId.error) errback("Error creating producer");
            videoProducerId = producerId.id;
            // console.log("producerId is ");
            // console.log(producerId);
            callback({ id: producerId });
          }
        );
      } catch (error) {
        console.error("Error creating producer:", error);
        errback(error);
      }
    }
  );
};

const setConsumerEvents = (consumerTransport) => {
  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      socket.emit(
        "connectTransport",
        { roomId, transportId: consumerTransport.id, dtlsParameters },
        (error) => {
          if (error) {
            errback(error);
          } else {
            callback();
          }
        }
      );
    }
  );
  // console.log("consumerTransport event listeners set");
};

socket.on("connect", async (socket) => {
  await startvideo();
  await joinRoom(roomId);
});

socket.on("newProducer", ({ producerId }) => {
  // console.log("newProducer event received");
  // console.log(producerId);
  const consumerTransportParams = createTransport(
    "createConsumerTransport"
  ).then((consumerTransportParams) => {
    // console.log("consumerTransportParams");
    // console.log(consumerTransportParams);
    const consumertransport = device.createRecvTransport(
      consumerTransportParams
    );
    // console.log("consumerTransport created");
    // console.log(consumerTransport);
    setConsumerEvents(consumertransport);
    // console.log("device.rtpCapabilities", device.rtpCapabilities);

    consumerTransport.set(consumertransport.id, consumertransport);

    const TransportId = consumertransport.id;

    consume(producerId, TransportId).then((consumer) => {
      const track = consumer.track;
      // console.log("track", track);
      console.log("track", track);
      if(track.kind === "video"){
        addRemoteVideoTag(consumer.producerId);
        let remoteVideo = document.getElementsByClassName(`vid-${consumer.producerId}`)[0];
        remoteVideo.srcObject = new MediaStream([track]);
        socket.emit("resumeConsumer", { roomId, consumerId: consumer.id } , (err) => {
          if (err) console.error(err);
        });
      } else if (track.kind === "audio") {
        let remoteVideo = document.getElementsByClassName(`vid-${consumer.producerId}`)[0];
        remoteVideo.srcObject.addTrack(track);
      }
    });
  });
});

socket.on("producerClosed", ({ producerId }) => {
  console.log("producer closed");
  document.getElementsByClassName(`card-${producerId}`)[0].remove();
  console.log("producer closed successfully");
});


function consume(producerId ,consumerTransportId) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "consume",
      {
        roomId,
        transportId: consumerTransportId,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      },
      async (params) => {
        if (params.error) {
          console.error("Error consuming producer", params.error);
          reject(params.error);
        }
        // console.log("Consuming producer", params);
        const consumertransport = consumerTransport.get(consumerTransportId);
        if (!consumertransport) {
          console.error("No consumer transport");
          return;
        }
        const consumer = await consumertransport.consume(params);

        consumers.set(consumer.id, consumer);

        resolve(consumer);
      }
    );
  });
}


let addRemoteVideoTag = (producerId) => {
  const gridContainer = document.querySelector(".grid-container");
  const card = document.createElement("div");
  card.className = "card";
  card.classList.add(`card-${producerId}`);
  card.innerHTML = `
      <div class="name">User ${producerId.substring(0,6)}</div>
      <video class="remote-video  vid-${producerId} " id="video-${videoIdCounter++}" autoplay></video>
      <button class="card-button" id="video-${1}"><i class="fas fa-video"></i></button>
      <button class="card-button2" id="audio-${1}"><i class="fas fa-volume-up"></i></button>
    `;
  gridContainer.appendChild(card);
  console.log("successfully added remote video tag");
};

let connectExistingProducers = (producersIds) => {
  createTransport(
    "createConsumerTransport"
  ).then((consumerTransportParams) => {
    const consumertransport = device.createRecvTransport(consumerTransportParams);
    setConsumerEvents(consumertransport);
    
    consumerTransport.set(consumertransport.id, consumertransport);

    producersIds.forEach((producerId) => {
      consume(producerId, consumertransport.id).then((consumer) => {
        // console.log("consumer created");
        // console.log(consumer);
        // console.log(consumer.producerId);
        const track = consumer.track;
        // console.log("track", track);
        let remoteVideo = document.getElementsByClassName(`vid-${consumer.producerId}`)[0];
  
        if(typeof remoteVideo === "undefined"){
          addRemoteVideoTag(consumer.producerId);
          remoteVideo = document.getElementsByClassName(`vid-${consumer.producerId}`)[0];
        }
  
        console.log("track", track);
        if(track.kind === "video"){
          remoteVideo.srcObject = new MediaStream([track]);
          socket.emit("resumeConsumer", { roomId, consumerId: consumer.id } , (err) => {
            if (err) console.error(err);
          });
        } else if (track.kind === "audio") {
          remoteVideo.srcObject.addTrack(track);
        }

      });
    });

  });
};

window.onbeforeunload = () => {
  
  socket.emit("leaveRoom", { roomId , producerId : videoProducerId }, (error) => {
    if (error) console.error(error);
  });

  videoProducer.close();
  producerTransport.close();
  // audioProducer.close();
}; 