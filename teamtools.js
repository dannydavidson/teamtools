var Teamtools = {};

// defaults
Teamtools.interval = 2000;
Teamtools.counter = 0;
Teamtools.latency = 0;
Teamtools.sync_frequency = 4;
Teamtools.flag_buffer = 1000;
Teamtools.drop_buffer = 1000;

// props
Teamtools.flag_callbacks = [];
Teamtools.drop_callbacks = [];

// collections
Teamtools.client = new Meteor.Collection('teamtools_client');
Teamtools.session = new Meteor.Collection('teamtools_session');

if (Meteor.isServer) {

    Meteor.methods({
        teamtools_time: function () {
            return new Date().getTime();
        }
    });

    Meteor.publish('teamtools_client', function () {
        return Teamtools.client.find({'user': this.userId});
    });

    Meteor.publish('teamtools_session', function () {
        return Teamtools.session.find({});
    });

    Teamtools.client.allow({
        'insert': function (userId, doc) {
            return true;
        },
        'update': function (userId, docs, fields, modifier) {
            return true;
        },
        'remove': function (userId, docs) {
            return false;
        }
    });

    Teamtools.session.allow({
        'insert': function (userId, doc) {
            return true;
        },
        'update': function (userId, docs, fields, modifier) {
            return true;
        },
        'remove': function (userId, docs) {
            return true;
        }
    });

    Teamtools.onFlagged = function (func) {
        Teamtools.flag_callbacks.push(func);
    }

    Teamtools.onDropped = function (func) {
        Teamtools.drop_callbacks.push(func);
    }

    Teamtools.clearFlagged = function (func) {

    }

    Teamtools.clearDropped = function (func) {

    }

    Teamtools.watchdrops = function () {
        Teamtools.watchdrops.handle = Meteor.setInterval(
            Teamtools._scandrops,
            Teamtools.interval
        );
    }

    Teamtools.unwatchdrops = function () {
        Meteor.clearInterval(Teamtools.watchdrops.handle);
    }

    Teamtools._scandrops = function () {
        var time = Meteor.call('teamtools_time');
        var clients = Teamtools.client.find({});
        clients.forEach(function (client) {
            var t = time - Teamtools.interval - client.latency - Teamtools.flag_buffer;
            if (!client.flagged && client.last_ping <= t) {
                Teamtools.client.update(
                    {'_id': client._id}, 
                    {'$set': {'flagged': time}}, 
                    function (err) {
                        if (!_.isObject(err)) {
                            _.each(Teamtools.flag_callbacks, function (callback) {
                                callback(client.user, client._id);
                            });
                        }
                        else {
                            console.log(err);
                        }
                    });
            }
            else if (client.flagged && client.flagged <= t - Teamtools.drop_buffer) {
                Teamtools.client.remove({'_id': client._id}, function (err) {
                    if (!_.isObject(err)) {
                        var session = Teamtools.session.findOne({'_id': client.session});
                        if (_.isObject(session)) {
                            if (client.user == session.speaker) {
                                Teamtools.session.update(
                                    {'_id': session._id}, 
                                    {'$set': {'speaker': null}});
                            }
                            else if (_.contains(session.requesting, client.user)) {
                                Teamtools.session.update(
                                    {'_id': session._id}, 
                                    {'$set': {
                                        'requesting': _.without(session.requesting, client.user)}
                                    });
                            };
                            _.each(Teamtools.drop_callbacks, function (callback) {
                                callback(client.user, client._id);
                            });
                        }
                        // else {
                        //     //console.log('Client not joined to session or session was removed without updating client')
                        // }
                    }
                    else {
                        console.log(err);
                    }
                });
            };
        });
    };

    Meteor.startup(function () {
        Teamtools.watchdrops();
    })
}

if (Meteor.isClient) {

    Teamtools.getSessionId = function (val) {
        
        // do deps stuff
        var context = Meteor.deps.Context.current;
        if (context && !Teamtools.listeners[context.id]) {
            Teamtools.listeners[context.id] = context;
            context.onInvalidate(function () {
                delete Teamtools.listeners[context.id];
            });
        }

        // return session value
        if (Meteor.user()) {
            // get session (or if empty create new session) from Teamtools.session collection
            if (!Teamtools.sessionId) {
                Teamtools.sessionId = Teamtools.session.insert({'speaker': Meteor.userId()})
            } 
            return Teamtools.sessionId;
        }
        else {
            // get session from local store
        }
    }

    Teamtools.setSessionId = function (val) {
        if (val === Teamtools.sessionId) {
            return;
        }
        Teamtools.sessionId = val;
        _.each(Teamtools.listeners, function (contextId) {
            Teamtools.listeners[contextId].invalidate();
        });
    }

    Teamtools.attr = function (key, value) {
        if (value) {
            // setter
        }
        else {
            // getter
        }
    }

    Teamtools.register = function () {
        // clean up first
        Teamtools.unregister();

        // subscribe to Teamtools
        Teamtools.subscriptions = [];
        Teamtools.subscriptions.push(Meteor.subscribe('teamtools_session', function () {
            console.log('Subscribed to Teamtools session collection')
        }));

        Teamtools.subscriptions.push(Meteor.subscribe('teamtools_client', function () {
            console.log('Subscribed to Teamtools client collection')
        }));

        if (Meteor.userId()) {
            var start_call = new Date().getTime();
            Meteor.call('teamtools_time', function (err, result) {
                Teamtools.latency = new Date().getTime() - start_call;
                Teamtools.time = result;
                Teamtools.id = Meteor.uuid();
                Teamtools._ping();
                Teamtools.register.handle = Meteor.setInterval(Teamtools._ping,
                                                               Teamtools.interval);
            });
        }
    }

    Teamtools.unregister = function () {
        if (Teamtools.register.handle) {
            Meteor.clearInterval(Teamtools.register.handle);
        }
        if (_.isArray(Teamtools.subscriptions)) {
            _.each(Teamtools.subscriptions, function (sub) {
                sub.stop();
            })
        }
    }

    Teamtools._ping = function () {
        Teamtools.counter++;
        if (Teamtools.counter > Teamtools.sync_frequency) {
            // if nth loop without time update
            Teamtools.counter = 0;
            var start_call = new Date().getTime();
            Meteor.call('teamtools_time', function (err, result) {
                Teamtools.latency = new Date().getTime() - start_call;
                Teamtools.time = result;
            });
        }
        else {
            // update time
            Teamtools.time = Teamtools.time + Teamtools.interval;
        }

        // write timestamp to client
        if (Meteor.userId()) {
            var client = Teamtools.client.findOne(
                {'id': Teamtools.id}, 
                {'fields': {'_id': 1}});
            if (_.isObject(client)) {
                Teamtools.client.update(
                    {'_id': client._id}, 
                    {'$set': {
                        'last_ping': Teamtools.time, 
                        'latency': Teamtools.latency, 
                        'user': Meteor.userId(),
                        'session': Teamtools.getSessionId()
                    }});
            } 
            else {
                Teamtools.client.insert({
                    'id': Teamtools.id, 
                    'last_ping': Teamtools.time, 
                    'latency': Teamtools.latency, 
                    'user': Meteor.userId(),
                    'session': Teamtools.getSessionId()
                });
            }
        }
    }

    Meteor.startup(function () {

        // set up autorun to toggle registration
        Meteor.autorun(function () {
            var u = Meteor.user();
            if (u) {
                Teamtools.register();
            }
            else {
                Teamtools.unregister();
            }
        });

    });
}