var express = require('express'),
app = express(),
server = require('http').createServer(app),
io = require('socket.io').listen(server),
path = require('path')

server.listen(process.env.PORT || 3000)

usernames = []
games = []

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html')
})

function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shuffle(array) {
        var currentIndex = array.length, temporaryValue, randomIndex ;

        // While there remain elements to shuffle...
        while (0 !== currentIndex) {

            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            // And swap it with the current element.
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }

        return array;
}

function rand(min,max) { return Math.floor((Math.random() * ++max) + min); }

function guid() {
  // To generate unique id
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function getGameById(id){
    for(room in games){
      if(games[room].id == id){
        return games[room]
      }
    }
}

function refreshRooms(){
  rooms = []
  for(room in games)
  {
    if(!room.isSettedUp)
      rooms.push({id: games[room].id, nick: games[room].nick1})
  }

  io.sockets.emit('updateRooms', {
    rooms: rooms
  })
}

function hideCards(cards){
    newCards = []
    for(i in cards){
        if(cards[i])
            newCards[i] = "4-2"
    }
    return newCards
}

var deste = function(){
        this.cards = [];
        for(var i = 0; i <= 3; i++)
        {
            for(var j = 0; j <= 12; j++)
            {
                this.cards[i*13+j] = i+"-"+j;
            }
        }
        this.mix = function()
        {
            shuffle(this.cards);
        }
    return this
}

// ===== Oyunun sınıfı
var game = function(){
    newDeste = new deste()
    newDeste.mix()
    self = this
    this.id = guid()
    this.p1 = null
    this.p2 = null
    this.nick1 = null
    this.nick2 = null
    this.deste = newDeste.cards
    this.ort= "4-2"
    this.ortSum = 0
    this.turn = 0
    this.lastTaker = 0
    this.isSettedUp = false

    this.setRoom = function(socket){
        self.p1 = socket
        self.nick1 = socket.nick

        self.p1.emit('updateScores',{
            myScore: 0,
            foeScore: 0
        })
    }

    this.joinRoom = function(socket){
        self.p2 = socket
        self.nick2 = socket.nick

        self.setGame()
        self.p1.socket.emit('setFoe',{
            nick: self.nick2,
            type: 'set'
        })
        self.p2.socket.emit('setFoe',{
            nick: self.nick1,
            type: 'set'
        })
        self.refreshScores()

    }

    this.setGame = function()
    {
        self.p1 = {
            id: self.p1.id,
            hand: [ false, false, false, false ],
            score: 0,
            socket: self.p1
        }
        self.p2 = {
            id: self.p2.id,
            hand: [ false, false, false, false ],
            score: 0,
            socket: self.p2

        }
        for(i = 0; i <= 3; i++){
            self.yereKartKoy(self.deste.pop())
        }

        self.turn = self.p1.id
        self.p1.socket.emit('setTurn', { turn: 'you' })
        self.p2.socket.emit('setTurn', { turn: 'foe' })
        self.isSettedUp = true

        self.kartDagit()

    }

    this.yereKartKoy = function(kart)
    {
        self.ort = kart
        self.ortSum++

        self.refreshOrt()
    }

    this.kartDagit = function(){
        if(self.deste.length < 8) return false

        for(i = 0; i < 4; i++)
            self.p1.hand[i] = (self.deste.pop())
        for(i = 0; i < 4; i++)
            self.p2.hand[i] = (self.deste.pop())

        self.refreshHands()

    }
    this.hamleYap = function(kim, kart){
        if(self.turn != kim) return false
        selectedCard = self.getPlayer(kim).hand[kart]
        if(!selectedCard) return false

        prevOrt = self.ort

        //Yerden Kart Alma Mekanizması
        if(self.ort && (self.getPlayer(kim).hand[kart].split("-")[1] == self.ort.split("-")[1] || self.getPlayer(kim).hand[kart].split("-")[1] == 10) && self.ortSum != 0)
        {
                self.getPlayer(kim).score +=
                    self.ortSum
                    + ((self.ortSum == 1 && self.getPlayer(kim).hand[kart].split("-")[1] != 10) || (self.getPlayer(kim).hand[kart].split("-")[1] == 10 && self.ort.split("-")[1] == 10) ? 9 : 1)
                    + (((self.getPlayer(kim).hand[kart].split("-")[1] == 10 || self.getPlayer(kim).hand[kart].split("-")[1] == 0 ) && (self.ortSum == 1) && (self.getPlayer(kim).hand[kart].split("-")[1] == self.ort.split("-")[1])) ? 10 : 0)

                self.lastTaker = kim
                self.ort = undefined
                self.ortSum = 0
                self.refreshScores()
        } else {
            self.yereKartKoy(self.getPlayer(kim).hand[kart])
        }

        self.getPlayer(kim).hand[kart] = false
        self.refreshHands()
        self.refreshOrt()


        if(kim == self.p1.id){
            self.turn = self.p2.id
            self.p2.socket.emit('setTurn', { turn: 'you' })
            self.p1.socket.emit('setTurn', { turn: 'foe' })
        } else {
            self.turn = self.p1.id
            self.p1.socket.emit('setTurn', { turn: 'you' })
            self.p2.socket.emit('setTurn', { turn: 'foe' })
        }
        if(self.controller()){
            self.kartDagit()

        }
    }

    this.controller = function(){
            r = 0;
            for(var i = 0; i < 4; i++)
            {
                if(self.p1.hand[i]) r=1;
                if(self.p2.hand[i]) r=1;
            }

            if(self.deste.length == 0 && r == 0)
            {
                if(self.lastTaker == self.p1.id)
                    self.p1.score += self.ortSum;
                else
                    self.p2.score += self.ortSum;
                self.refreshScores()

                if(self.p1.score > self.p2.score){
                    self.p1.socket.emit('alertWinner', {winner:self.p1.socket.nick})
                    self.p2.socket.emit('alertWinner', {winner:self.p1.socket.nick})
                } else if(self.p2.score > self.p1.score){
                    self.p1.socket.emit('alertWinner', {winner:self.p2.socket.nick})
                    self.p2.socket.emit('alertWinner', {winner:self.p2.socket.nick})
                } else {
                    self.p1.socket.emit('alertWinner', {winner: "All Players"})
                    self.p2.socket.emit('alertWinner', {winner: "All Players"})
                }
                self.playerExit()
                return false
            }
            if(r == 0)
                return true;
            else
                return false
    }
    this.refreshOrt = function(){
        self.p1.socket.emit('refreshOrt', {
          ort: self.ort,
          ortSum: self.ortSum
        })

        self.p2.socket.emit('refreshOrt', {
          ort: self.ort,
          ortSum: self.ortSum
        })
    }
    this.refreshHands = function(){
        self.p1.socket.emit('refreshCards', {
          hand: (self.p1.hand),
          foeHand: hideCards(self.p2.hand)
        })

        self.p2.socket.emit('refreshCards', {
          hand: (self.p2.hand),
          foeHand: hideCards(self.p1.hand)
        })
    }
    this.refreshScores = function(){
        self.p1.socket.emit('updateScores',{
            myScore: self.p1.score,
            foeScore: self.p2.score
        })
        self.p2.socket.emit('updateScores',{
            myScore: self.p2.score,
            foeScore: self.p1.score
        })
    }
    // Query for selecting playerd
    this.getPlayer = function(id){
        if(id == self.p1.id)
            return self.p1
        if(id == self.p2.id)
            return self.p2
        return false
    }

    this.playerExit = function(){
      if(self.isSettedUp){


          self.p1.socket.emit('setFoe',{
              nick: ""
          })
          self.p2.socket.emit('setFoe',{
              nick: ""
          })

        type = 'ended'

        if(self.deste.length > 0)
            type = 'left'

        delete self.p1.socket.game
        delete self.p2.socket.game
        self.p1.socket.emit('getOutOfRoom',{ type:type })
        self.p2.socket.emit('getOutOfRoom',{ type:type })
      } else {
          self.p1.emit('getOutOfRoom',{ type:'abort' })
          delete self.p1.game
      }
      delete games[games.indexOf(self)]

      refreshRooms()
    }
}


SOCKET_LIST = []

var Clients = function(){
    self = this

    this.add = function(socket){
        SOCKET_LIST.push(socket)
    }

    this.remove = function(socket){

        if(socket.game){
          socket.game.playerExit()
        }

        if(!SOCKET_LIST.indexOf(socket)) return false

        SOCKET_LIST.splice(SOCKET_LIST.indexOf(socket), 1)
        usernames.splice(usernames.indexOf(socket.nick), 1)
    }

    this.getSocket = function(id){
        for(socket in SOCKET_LIST)
        {
            if(SOCKET_LIST[socket.id] == id)
            {
                return socket
                break
            }
        }
    }
}
clients = new Clients()



io.sockets.on('connection',function(socket){

    clients.add(socket)

    /*socket.on('sendMsg',function(data){
        io.sockets.emit('getMsg',{ msg: htmlEntities(data.msg), nick: socket.nick })
    })*/

    socket.on('setNick',function(data, callback){
        data = htmlEntities(data)
        if(usernames.indexOf(data) == -1){
            callback(true)
            usernames.push(data)
            socket.nick = data
            io.sockets.emit('updateUsers', { nicks: usernames })
            refreshRooms()

        } else {
            callback(false)
        }
    })

    socket.on('createGame',function(data, callback){
      if(!socket.game){
        newGame = new game()
        newGame.setRoom(socket)
        socket.game = newGame
        games.push(newGame)

        callback(true)

        refreshRooms()
      }
    })

    socket.on('joinGame',function(data, callback){
      if(!socket.game ){

        myGame = getGameById(data.gameid)
        if(!myGame.p1) return false
        myGame.joinRoom(socket)
        socket.game = myGame

        callback(true)

        refreshRooms()
      }
    })

    socket.on('kartAt',function(data, callback){
        if(socket.game && socket.game.isSettedUp)
        {
            if(socket.game.turn == socket.id){
                if(data.id.length != 4) return false
                card = data.id.slice(-1)
                socket.game.hamleYap(socket.id, card-1)
            }
        }

    })

    socket.on('disconnect',function(data){
        clients.remove(socket)

        io.sockets.emit('updateUsers', { nicks: usernames })
    })
})
