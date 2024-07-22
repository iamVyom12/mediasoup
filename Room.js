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

  removePeer(peerId) {
    const peer = this.peers.get(peerId);//peerId is Users socket.id
    if (peer) {
      this.peers.delete(peerId);
      this.producers.delete(peerId);
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

  addProducer(userId , producer) {
    this.producers.set(userId, producer);
  }

  removeProducer(userId) {
    this.producers.delete(userId);
  }

  getProducer(userId) {
    return this.producers.get(userId);
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