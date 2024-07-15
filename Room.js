class Room {
  mediaCodecs = [
    { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: { "x-google-start-bitrate": 1000 },
    },
  ];

  constructor(roomId) {
    this.roomId = roomId;
    this.peers = new Map();
    this.producers = new Map();
  }

  async initRouter(worker) {
    this.router = await worker.createRouter({mediaCodecs : this.mediaCodecs}).then((router) => {
      // router.rtpCapabilities.codecs = this.mediaCodecs;
      return router;
    });
  }

  addPeer(peer) {
    this.peers.set(peer.id, peer);
  }

  removePeer(peerId,producerId) {
    const peer = this.peers.get(peerId);//peerId is Users socket.id
    if (peer) {
      this.peers.delete(peerId);
      this.producers.delete(producerId);
    }
  }

  getPeers() {
    return Array.from(this.peers.values());
  }

  getPeer(peerId) {
    return this.peers.get(peerId);
  }

  getRouter() {
    return this.router;
  }

  addProducer(producer) {
    this.producers.set(producer.id, producer);
  }

  removeProducer(producerId) {
    this.producers.delete(producerId);
  }

  getProducer(producerId) {
    return this.producers.get(producerId);
  }

  getProducers() {
    return Array.from(this.producers.values());
  }

  static async create(roomId, worker) {
    const room = new Room(roomId, worker);
    await room.initRouter(worker); // Ensure router is initialized
    return room;
  }
}

export default Room;