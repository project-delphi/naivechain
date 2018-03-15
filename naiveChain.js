const CryptoJS = require("crypto-js")
const express = require("express")
const bodyParser = require("body-parser")
const WebSocket = require("ws")

class Block {
  constructor(index, previousHash, timestamp, data, hash) {
    this.index = index
    this.previousHash = previousHash.toString()
    this.timestamp = timestamp
    this.data = data
    this.hash = hash.toString()
  }
}

const initHttpServer = (blockchain, sockets, MessageType, http_port) => {
  const app = express()
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))
  app.get("/blocks", (req, res) => res.send(JSON.stringify(blockchain)))
  app.post("/mineBlock", (req, res) =>
    mineBlock(req, res, blockchain, sockets, MessageType)
  )
  app.get("/peers", (req, res) => Peers(req, res, sockets))
  app.post("/addPeer", (req, res) => {
    connectToPeers([req.body.peer], blockchain, sockets, MessageType)
    res.send()
  })
  app.listen(http_port, () =>
    console.log("Listening http on port: " + http_port)
  )
}

const Peers = (req, res, sockets) => {
  res.send(
    sockets.map(s => s._socket.remoteAddress + ":" + s._socket.remotePort)
  )
}

const mineBlock = (req, res, blockchain, sockets, MessageType) => {
  console.log("incoming mine block request")
  const newBlock = generateNextBlock(req.body.data, blockchain)
  addBlock(newBlock, blockchain)
  broadcast(responseLatestMsg(MessageType, blockchain), sockets)
  console.log("block added: " + JSON.stringify(newBlock))
  res.send()
}

const initP2PServer = (blockchain, sockets, MessageType, p2p_port) => {
  const server = new WebSocket.Server({ port: p2p_port })
  server.on("connection", ws =>
    initConnection(ws, blockchain, sockets, MessageType)
  )
  console.log("listening websocket p2p port on: " + p2p_port)
}

const initConnection = (ws, blockchain, sockets, MessageType) => {
  sockets.push(ws)
  initMessageHandler(ws, blockchain, MessageType, sockets)
  initErrorHandler(ws, sockets)
  write(ws, queryChainLengthMsg(MessageType))
}

const initMessageHandler = (ws, blockchain, MessageType, sockets) => {
  ws.on("message", data => {
    const message = JSON.parse(data)
    console.log("Received message" + JSON.stringify(message))
    switch (message.type) {
    case MessageType.QUERY_LATEST:
      write(ws, responseLatestMsg(MessageType, blockchain))
      break
    case MessageType.QUERY_ALL:
      write(ws, responseChainMsg(MessageType, blockchain))
      break
    case MessageType.RESPONSE_BLOCKCHAIN:
      handleBlockchainResponse(message, blockchain, MessageType, sockets)
      break
    }
  })
}

const initErrorHandler = (ws, sockets) => {
  ws.on("close", () => closeConnection(ws, sockets))
  ws.on("error", () => closeConnection(ws, sockets))
}

const closeConnection = (ws, sockets) => {
  console.log("connection failed to peer: " + ws.url)
  sockets.splice(sockets.indexOf(ws), 1)
}

const generateNextBlock = (blockData, blockchain) => {
  const previousBlock = getLatestBlock(blockchain)
  const nextIndex = previousBlock.index + 1
  const nextTimestamp = new Date().getTime() / 1000
  const nextHash = calculateHash(
    nextIndex,
    previousBlock.hash,
    nextTimestamp,
    blockData
  )
  return new Block(
    nextIndex,
    previousBlock.hash,
    nextTimestamp,
    blockData,
    nextHash
  )
}

const calculateHashForBlock = block => {
  return calculateHash(
    block.index,
    block.previousHash,
    block.timestamp,
    block.data
  )
}

const calculateHash = (index, previousHash, timestamp, data) => {
  return CryptoJS.SHA256(index + previousHash + timestamp + data).toString()
}

const addBlock = (newBlock, blockchain) => {
  if (isValidNewBlock(newBlock, getLatestBlock(blockchain))) {
    blockchain.push(newBlock)
  }
}

const isValidNewBlock = (newBlock, previousBlock) => {
  if (previousBlock.index + 1 !== newBlock.index) {
    console.log("invalid index")
    return false
  } else if (previousBlock.hash !== newBlock.previousHash) {
    console.log("invalid previoushash")
    return false
  } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
    console.log(
      typeof newBlock.hash + " " + typeof calculateHashForBlock(newBlock)
    )
    console.log(
      "invalid hash: " + calculateHashForBlock(newBlock) + " " + newBlock.hash
    )
    return false
  }
  return true
}

const connectToPeers = (newPeers, blockchain, sockets, MessageType) => {
  newPeers.forEach(peer => {
    const ws = new WebSocket(peer)
    ws.on("open", () => initConnection(ws, blockchain, sockets, MessageType))
    ws.on("error", () => {
      console.log("connection failed")
    })
  })
}

const handleBlockchainResponse = (message, blockchain, MessageType, sockets) => {
  const receivedBlocks = JSON.parse(message.data).sort(
    (b1, b2) => b1.index - b2.index)
  const latestBlockReceived = getLatestBlock(receivedBlocks)
  const latestBlockHeld = getLatestBlock(blockchain)
  compareBlocks(latestBlockReceived,latestBlockHeld,MessageType,
    blockchain,sockets)
}

const compareBlocks = (latestBlockReceived,latestBlockHeld,MessageType,
  blockchain,sockets) => {
  if (latestBlockReceived.index > latestBlockHeld.index) {
    console.log("blockchain possibly behind. We got: " +
        latestBlockHeld.index + " Peer got: " + latestBlockReceived.index)
    if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
      console.log("We can append the received block to our chain")
      blockchain.push(latestBlockReceived)
      broadcast(responseLatestMsg(MessageType, blockchain), sockets)
    } else if (receivedBlocks.length === 1) {
      console.log("We have to query the chain from our peer")
      broadcast(queryAllMsg(MessageType), sockets)
    } else {
      console.log("Received blockchain is longer than current blockchain")
      replaceChain(receivedBlocks, blockchain, MessageType, sockets)
    }
  } else {
    console.log(
      "received blockchain is not longer than current blockchain. Do nothing"
    )
  }

}

const replaceChain = (newBlocks, blockchain, MessageType, sockets) => {
  if (
    isValidChain(newBlocks, blockchain) &&
    newBlocks.length > blockchain.length
  ) {
    console.log(
      "Received blockchain is valid. Replacing current blockchain with received blockchain"
    )
    blockchain = newBlocks
    broadcast(responseLatestMsg(MessageType, blockchain), sockets)
  } else {
    console.log("Received blockchain invalid")
  }
}

const isValidChain = (blockchainToValidate, blockchain) => {
  if (
    JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(blockchain[0])
  ) {
    return false
  }
  const tempBlocks = [blockchainToValidate[0]]
  for (let [index, block] of blockchainToValidate.entries()) {
    const validBlockFlag = isValidNewBlock(block, tempBlocks[index])
      ? tempBlocks.push(block)
      : false
    if (!validBlockFlag) return false
  }
  return true
}

const getLatestBlock = blockchain => blockchain[blockchain.length - 1]
const queryChainLengthMsg = MessageType => ({ type: MessageType.QUERY_LATEST })
const queryAllMsg = MessageType => ({ type: MessageType.QUERY_ALL })
const responseChainMsg = (MessageType, blockchain) => ({
  type: MessageType.RESPONSE_BLOCKCHAIN,
  data: JSON.stringify(blockchain)
})
const responseLatestMsg = (MessageType, blockchain) => ({
  type: MessageType.RESPONSE_BLOCKCHAIN,
  data: JSON.stringify([getLatestBlock(blockchain)])
})

const write = (ws, message) =>  ws.send(JSON.stringify(message))
const broadcast = (message, sockets) =>  sockets.forEach(socket => write(socket, message))

const getGenesisBlock = data =>  new Block(0,"0",1465154705, data,
  "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7"
)

    
module.exports = { initHttpServer, initP2PServer,connectToPeers, getGenesisBlock }
