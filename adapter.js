const Emitter = require('events').EventEmitter
const monk = require('monk')
const msgpack = require('notepack.io')
const uuid = require('uuid/v4')
const _ = require('lodash')

class Room {
  sids = {}
  length = 0

  add(sids) {
    for (id of sids) {
      if (!this.sids[id]) {
        this.sids[id] = true
        this.length++
      }
    }
  }

  del(sids) {
    for (id of sids) {
      if (this.sids[id]) {
        delete this.sids[id]
        this.length--
      }
    }
  }

  ids() {
    return Object.keys(this.sids)
  }

  contains(id) {
    return this.sids[id] ? true : false
  }

  isEmpty() { return this.length === 0 }
}

class Adapter extends EventEmitter {


  /**
   * Maps user to object of rooms.
   */
  _users = {}


  /**
   * Maps room id to a Room istance. Each user has his own room, that contains
   * his sids.
   */
  _rooms = {}

  /**
   * Maps sid to user
   */
  _sids = {}

  constructor(nsp) {
    this.nsp = nsp
    this.encoder = nsp.server.encoder
  }

  addSid(sid, user) {
    // maps sid to user
    this._sids[sid] = user
    // creates user rooms object if necessary
    this._users[user] = this._users[user] || {}
    // get rooms user is in
    const rooms = [user, ...Object.keys(this._users[user])]
    // add sid to those rooms
    this.addAll(sid, rooms)
  }

  delSid(sid) {
    const user = this._sids[sid]
    delete this._sids[sid]
    const rooms = [user, ...Object.keys(this._users[user])]
    rooms.forEach((room) => {
      this.del(sid, room)
    })
    // if no sockets are left for the user
    if (!this._rooms[user])
  }


  joinRoom(users, rooms) {

  }

  leaveRoom(users, rooms) {}

  users(rooms) {
    if (!rooms || !rooms.length)
      return Object.keys(this._users)
    let users = {}
    for (let room of rooms) {
      if (!room in this._rooms)
        continue;
      for (let sid in this._rooms[room]) {
        const user = this._sids[sid]
        users[user] = true
      }
    }
    return Object.keys(users)
  }

  /**
   * @param  {string[]} rooms description
   * @return {string[]}       Array of sids.
   */
  sidsByRooms(rooms) {
    let sids = {}
    rooms = rooms || []
    if (!rooms.length) return Object.keys(this._sids)
    for (let room of rooms) {
      const roomSids = Object.keys(this._rooms[room])
      roomSids.forEach((sid) => { sids[sid] = true} )
    }
    return Object.keys(sids)
  }

  /**
   *
   *
   * @param  {string[]} rooms Rooms to check.
   * @param  {function} fn
   * @return {string[]}       Array of socket ids.
   */
  clients(rooms, fn) {
    if ('function' == typeof rooms){
      fn = rooms
      rooms = null
    }
    rooms = rooms || []
    const sids = this.sidsByRooms(rooms)
    if (fn) process.nextTick(fn.bind(null, null, sids));
  }

  broadcast(packet, opts) {
    const rooms = opts.rooms || []
    const except = opts.except || []
    const flags = opts.flags || {}
    const packetOpts = {
      preEncoded: true,
      volatile: flags.volatile,
      compress: flags.compress
    }
    packet.nsp = this.nsp.name
    const sids = _.difference(
      this.sidsByRooms(rooms),
      except.length ? this.sidsByRooms(except) : []
    )
    this.encoder.encode(packet, (encoded) => {
      for (let sid of sids) {
        const socket = this.nsp.connected[sid]
        if (socket)
          socket.packet(encodedPackets, packetOpts)
      }
    })
  }

  add(id, room, fn) {
    this.addAll(id, [room], fn)
  }

  addAll(id, rooms, fn) {
    for (let room of rooms) {
      this._rooms[room] = this._rooms[room] || new Room()
      this._rooms[room].add([id])
    }
    if (fn) process.nextTick(fn.bind(null, null))
  }

  del(id, room, fn) {
    if (!this._rooms[room])
      return
    this._rooms[room].del(id)
    if (this._rooms[room].isEmpty())
      delete this._rooms[room]
    if (fn) process.nextTick(fn.bind(null, null))
  }

  delAll(id, fn) {
    const user = this._sids[id]
    if (!user) return
    for (let room in this._users[user]) {
      this.del(id, room)
    }
    if (fn) process.nextTick(fn.bind(null, null))
  }

  userSids(user) {
    return
      this._rooms[user]
        ? Object.keys(this._rooms[user])
        : []
  }

  userRooms(user) {
    return
      this._users[user]
        ? Object.keys(this._users[user])
        : []
  }
}
