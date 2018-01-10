#!/usr/bin/env node

if(process.argv.length<5) {
  console.log(`USAGE: node ${process.argv[1]} <localPort> <remoteHost> <remotePort>`)
  process.exit(1)
}

const localPort = process.argv[2]
const remoteHost = process.argv[3]
const remotePort = process.argv[4]

const http = require('http')
const moment = require('moment')
const websocket = require('websocket')

let lastLog = Date.now()

function log(addr, ...args) {
  let now = Date.now()
  let delay = now - lastLog
  lastLog = now
  console.log('\n['+moment().format("DD.MM.YYYY HH:mm:ss")+']', '[ after '+delay+'ms ]', `[${addr}]`, ...args)
}

var server = http.createServer(function (creq, cres) {
  log(creq.connection.remoteAddress, 'request', creq.url, creq.method)
  creq.headers.host = `${remoteHost}:${remotePort}`
  //log(creq.connection.remoteAddress, "headers", creq.headers)

  var options = {
    hostname: remoteHost,
    port: remotePort,
    path: creq.url,
    method: creq.method,
    headers: creq.headers
  }

  log(creq.connection.remoteAddress, 'request headers:\n', JSON.stringify(creq.headers, null, "  "))

  var proxy = http.request(options, function (res) {
    log(creq.connection.remoteAddress, 'response', creq.url, res.statusCode, res.statusMessage)
    log(creq.connection.remoteAddress, 'response headers:\n', JSON.stringify(creq.headers, null, "  "))
    cres.writeHead(res.statusCode, res.statusMessage, res.headers)
    res.pipe(cres, {
      end: true
    })
  })

  const maxCapture = 4096
  let buffer = ""
  creq.on('data', function(data){
    if(buffer.length > maxCapture) return
    buffer += data
  })
  creq.on('end', function() {
    if(buffer.length > maxCapture) return
    if(buffer.length == 0) return
    log(creq.connection.remoteAddress, 'request payload:\n', buffer)
  })

  creq.pipe(proxy, {
    end: true
  })
})


wsServer = new websocket.server({
  httpServer: server,
  autoAcceptConnections: false
})


wsServer.on('request', function(request) {

  let remoteWS = `ws://${remoteHost}:${remotePort}${request.resourceURL.href}`
  log(request.remoteAddress, 'websocket request', request.resourceURL.href, '-->', remoteWS)

  let client = new websocket.client()

  client.on('connectFailed', function(error) {
    log(request.remoteAddress, 'websocket server connection failed: ', error.toString())
  })

  client.on('connect', function(connection) {
    var clientConnection = request.accept(connection.protocol, request.origin)
    log(request.remoteAddress, 'websocket connected, protocol:', JSON.stringify(connection.protocol))

    connection.on('error', function(error) {
      log(request.remoteAddress, 'websocket server connection error: ', error.toString())
      clientConnection.close()
    })
    connection.on('close', function() {
      log(request.remoteAddress, 'websocket server connection closed by server')
      clientConnection.close()
    })
    connection.on('message', function(message) {
      if (message.type === 'utf8') {
        clientConnection.sendUTF(message.utf8Data)
        log(request.remoteAddress, "frame from server:\n", message.utf8Data);
      }
      if (message.type === 'binary') {
        clientConnection.sendBytes(message.binaryData)
        log(request.remoteAddress, "binary frame from server");
      }
    })

    clientConnection.on('message', function(message) {
      if (message.type === 'utf8') {
        connection.sendUTF(message.utf8Data)
        log(request.remoteAddress, "frame from client:\n", message.utf8Data);
      }
      if (message.type === 'binary') {
        connection.sendBytes(message.binaryData)
        log(request.remoteAddress, "binary frame from client");
      }
    })
    clientConnection.on('close', function(reasonCode, description) {
      log(request.remoteAddress, 'websocket connection closed by client')
      connection.close()
    })
  })

  client.connect(remoteWS, request.requestedProtocols)
})

server.listen(localPort);

log("Proxy listening on port "+localPort)
