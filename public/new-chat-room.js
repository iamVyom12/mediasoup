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
// let videoProducerId;
let audioProducer;
// let audioProducerId;
let consumers = new Map();

let startvideo = async () => {
  const video = document.getElementsByClassName("local-video")[0];
  await navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      videoParams.track = track;
      audioParams.track = audioTrack;
      const videoButton = document.getElementById("videoButton");
      const muteButton = document.getElementById("muteButton");

      videoButton
        .addEventListener("click", async () => {
          track.enabled = !track.enabled;

          videoButton.innerHTML = track.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';

        });
      muteButton
        .addEventListener("click", async () => {
          audioTrack.enabled = !audioTrack.enabled;

          muteButton.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
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
          videoProducer = await producerTransport.produce({
            ...videoParams,
            appData: {
              mediaTag: "video",
              userId: socket.id,
            },
          });
          audioProducer = await producerTransport.produce({
            ...audioParams,
            appData: {
              mediaTag: "audio",
              userId: socket.id,
            },
          });

          videoProducer.on("trackended", () => {
            console.log("track ended");
          });
          audioProducer.on("trackended", () => {
            console.log("track ended");
          });
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
    async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        // console.log("producerTransport id is " + producerTransport.id);
        socket.emit(
          "produce",
          {
            roomId,
            transportId: producerTransport.id,
            kind,
            rtpParameters,
            appData,
          },
          (producerId) => {
            if (producerId.error) errback("Error creating producer");
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
    // console.log(consumertransport.id);
    setConsumerEvents(consumertransport);
    // console.log("device.rtpCapabilities", device.rtpCapabilities);

    consumerTransport.set(consumertransport.id, consumertransport);

    const TransportId = consumertransport.id;

    handleNewProducer(producerId, TransportId);
  });
});

socket.on("producerClosed", ({ videoProducerId,audioProducerId }) => {
  console.log("producer closed");
  document.getElementsByClassName(`card-${videoProducerId}`)[0].remove();
  console.log("producer closed successfully");
});

const consume = (producerId, consumerTransportId) => {
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

let connectExistingProducers = (producersIds) => {
  producersIds.forEach((producerId) => {
    createTransport("createConsumerTransport").then(
      (consumerTransportParams) => {
        const consumertransport = device.createRecvTransport(
          consumerTransportParams
        );
        setConsumerEvents(consumertransport);

        consumerTransport.set(consumertransport.id, consumertransport);
        handleNewProducer(producerId, consumertransport.id);
  });
  });
};

window.onbeforeunload = () => {
  socket.emit(
    "leaveRoom",
    {
      roomId,
      videoProducerId: videoProducer.id.id,
      audioProducerId: audioProducer.id.id,
    },
    (error) => {
      if (error) console.error(error);
    }
  );

  videoProducer.close();
  audioProducer.close();
  producerTransport.close();
};

const handleNewProducer = (producerId, consumerTransportId) => {
  // console.log("handling new producer");
  const consumer = consume(producerId, consumerTransportId).then((consumer) => {
    if (consumer.kind == "video") {
      addRemoteVideoTag(
        consumer.producerId,
        consumer.id,
        consumer.track,
        consumer.appData.userId
      );
    } else if (consumer.kind == "audio") {
      addRemoteAudioTrack(consumer.track, consumer.appData.userId);
    }
  });
};

const addRemoteAudioTrack = async (track, userId) => {
  console.log("adding remote audio track to", userId);
  const video = document.getElementsByClassName(`video-${userId}`)[0];
  if (typeof video != "undefined") {
    video.srcObject.addTrack(track);
    toggleAudio(track,userId);
  } else {
    setTimeout(() => {
      addRemoteAudioTrack(track, userId);
    }, 200);
  }
};

const addRemoteVideoTag = (producerId, consumerId, track, userId) => {
  console.log("adding remote video tag to", userId);
  const gridContainer = document.querySelector(".grid-container");
  const card = document.createElement("div");
  card.className = "card";
  card.classList.add(`card-${producerId}`);
  card.innerHTML = `
      <div class="name">User ${producerId.substring(0, 6)}</div>
      <video class="remote-video  vid-${producerId} video-${userId}" id="video-${videoIdCounter++}" autoplay></video>
      <button class="card-button" id="video-${producerId}"><i class="fas fa-video"></i></button>
      <button class="card-button2" id="audio-${userId}"><i class="fas fa-volume-up"></i></button>
    `;
  gridContainer.appendChild(card);

  const video = document.getElementsByClassName(`video-${userId}`)[0];
  video.srcObject = new MediaStream([track]);
  socket.emit("resumeConsumer", { roomId, consumerId }, (err) => {
    if (err) console.error(err);
  });
  console.log("successfully added remote video tag");

  toggleVideo(track, producerId);

};

const toggleVideo = (videoTrack,producerId ) => {
  if (videoTrack) {
    const videoButton =
    document.getElementById(`video-${producerId}`);

    videoButton.addEventListener("click", () => {
      videoTrack.enabled = !videoTrack.enabled;

      videoButton.innerHTML = videoTrack.enabled 
      ? '<i class="fas fa-video"></i>' 
      : '<i class="fas fa-video-slash"></i>';
    });

  }
}

const toggleAudio = (audioTrack,userId ) => {
  if (audioTrack) {
    const audioButton =
    document.getElementById(`audio-${userId}`);

    audioButton.addEventListener("click", () => {
      audioTrack.enabled = !audioTrack.enabled;

      audioButton.innerHTML = audioTrack.enabled 
      ? '<i class="fas fa-volume-up"></i>' 
      : '<i class="fas fa-volume-mute"></i>';
    });

  }
}