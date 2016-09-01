var express = require('express'),
app = express(),
server = require('http').createServer(app),
io = require('socket.io').listen(server),
path = require('path')

server.listen(process.env.PORT || 3000)

usernames = []

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html')
})
function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

io.sockets.on('connection',function(socket){
    socket.on('sendMsg',function(data){
        io.sockets.emit('getMsg',{msg: htmlEntities(data.msg), nick: socket.nick})
    })

    socket.on('setNick',function(data, callback){
        data = htmlEntities(data)
        if(usernames.indexOf(data) == -1){
            callback(true)
            usernames.push(data)
            socket.nick = data
            io.sockets.emit('updateUsers', { nicks: usernames })
        } else {
            callback(false)
        }
    })
    socket.on('disconnect',function(data){
        usernames.splice(usernames.indexOf(socket.nick), 1)
        io.sockets.emit('updateUsers', { nicks: usernames })
    })
})
