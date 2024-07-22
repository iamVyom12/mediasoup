class User {
    constructor(socket,roomId) {
      this.id = socket.id;
      this.roomid = roomId;
      this.socket = socket;
      this.producerTransport = null;
      this.consumerTransports = [];
      this.consumers = new Map();
    }
  
    async createProducerTransport(router) {
      return new Promise(async (resolve, reject) => {
      this.producerTransport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
      resolve(this.producerTransport);
      this.producerTransport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          producerTransport.close();
        }
      });
      this.producerTransport.on("close", () => {
        console.log("producerTransport closed");
      });
      
      this.producerTransportParams = {
        id: this.producerTransport.id,
        iceParameters: this.producerTransport.iceParameters,
        iceCandidates: this.producerTransport.iceCandidates,
        dtlsParameters: this.producerTransport.dtlsParameters,
        sctpParameters: this.producerTransport.sctpParameters,
      };
    });
    }
  
    async createConsumerTransport(router) {
      return new Promise(async (resolve, reject) => {
      const consumerTransport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      consumerTransport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          consumerTransport.close();
        }
      });
      consumerTransport.on("close", () => {
        console.log("consumerTransport closed");
      });

      this.consumerTransports.push(consumerTransport);

      resolve(consumerTransport);

      this.consumerTransportParams = {
        id: consumerTransport.id,
        iceParameters: consumerTransport.iceParameters,
        iceCandidates: consumerTransport.iceCandidates,
        dtlsParameters: consumerTransport.dtlsParameters,
        sctpParameters: consumerTransport.sctpParameters,
      };
    });
    }
  
  
    addConsumer(consumer) {
      this.consumers.set(consumer.id, consumer);
    }

    getConsumer(consumerId) {
        return this.consumers.get(consumerId);
        }

    // close() {
    //   this.producers.forEach(producer => producer.close());
    //   this.consumers.forEach(consumer => consumer.close());
    //   if (this.producerTransport) this.producerTransport.close();
    //   this.consumerTransports.forEach(transport => transport.close());
    // }
    
  }
  
  export default User;
  