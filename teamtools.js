var Teamtools = {};

//constants
Teamtools.CLIENT_COLLECTION = 'teamtools_client';
Teamtools.SESSION_COLLECTION = 'teamtools_session';
Teamtools.TIME_METHOD = 'teamtools_time';

// defaults
Teamtools.interval = 2000;
Teamtools.counter = 0;
Teamtools.latency = 0;
Teamtools.sync_frequency = 2;
Teamtools.flag_buffer = 1000;
Teamtools.drop_buffer = 1000;

// props
Teamtools.flag_callbacks = [];
Teamtools.drop_callbacks = [];

// collections
Teamtools.client = new Meteor.Collection(Teamtools.CLIENT_COLLECTION);
Teamtools.session = new Meteor.Collection(Teamtools.SESSION_COLLECTION);

if (Meteor.isServer) {

    Meteor.methods({
        teamtools_time: function () {
            return new Date().getTime();
        }
    });

    Meteor.publish("allUserData", function () {
        return Meteor.users.find({}, {fields: {'_id': 1, 'username': 1}});
    });

    Meteor.publish("userData", function () {
        return Meteor.users.find({}, {fields: {'_id': 1, 'username': 1}});
    });

    Meteor.publish(Teamtools.CLIENT_COLLECTION, function () {
        return Teamtools.client.find({});
    });

    Meteor.publish(Teamtools.SESSION_COLLECTION, function () {
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

        var time = Meteor.call(Teamtools.TIME_METHOD);
        
        var clients = Teamtools.client.find({});
        var sessions = Teamtools.session.find({});


        // clean up for clients
        clients.forEach(function (client) {
            var t = (time - Teamtools.interval - client.latency 
                     - Teamtools.flag_buffer);
            if (!client.flagged && client.last_ping <= t) {
                Teamtools.client.update(
                    {'_id': client._id}, 
                    {'$set': {'flagged': time}}, 
                    function (err) {
                        if (!_.isObject(err)) {
                            _.each(
                                Teamtools.flag_callbacks, 
                                function (callback) {
                                    callback(client.user, client._id);
                                }
                            );
                        }
                        else {
                            console.log(err);
                        }
                    });
            }
            else if (client.flagged &&
                     client.flagged <= t - Teamtools.drop_buffer) {

                Teamtools.client.remove({'_id': client._id}, function (err) {
                    if (!_.isObject(err)) {
                        
                        var session = Teamtools.session.findOne({
                            '_id': client.session
                        });

                        if (_.isObject(session)) {

                            if (client.user == session.speaker) {

                                Teamtools.session.update(
                                    {'_id': session._id}, 
                                    {'$set': {'speaker': null}});
                            }

                            else if (_.contains(session.requesting, 
                                                client.user)) {

                                Teamtools.session.update(
                                    {'_id': session._id}, 
                                    {'$set': {
                                        'requesting': _.without(
                                            session.requesting, 
                                            client.user
                                        )}
                                    });
                            };

                            _.each(
                                Teamtools.drop_callbacks, 
                                function (callback) {
                                    callback(client.user, client._id);
                                }
                            );
                        }

                        else {
                            console.log('Client not joined to session or'
                                     + ' session was removed without' 
                                     + ' updating client')
                        }
                    }
                    else {
                        console.log(err);
                    }
                });
            };
        });

        // clean up for sessions
        sessions.forEach(function (session) {
            var count = Teamtools.client.find({'session': session._id}).count();
            if (count == 0) {
                //Teamtools.session.remove(session._id);
            }
        });

    };

    Meteor.startup(function () {
        Teamtools.session.remove({});
        Teamtools.session.insert({'default': true})
        Teamtools.watchdrops();
    })
}

if (Meteor.isClient) {

    Teamtools.listeners = {};
    Teamtools._sessionId = null;

    Teamtools.subs = {'queues': {}};
    Teamtools.subs.load = function (config) {
        var id = _.uniqueId();
        var q = Teamtools.subs.queues[id] = {};
        _.each(config.subs, function (sub) {
            q[sub.key] = false;
            Teamtools.subscriptions.push(Meteor.subscribe(sub.key, function () {
                q[sub.key] = true;
                if (_.isFunction(sub.callback)) {
                    sub.callback();
                }
                if (_.all(q, _.identity)) {
                    delete Teamtools.subs.queues[id];
                    if (_.isFunction(config.onComplete)) {
                        config.onComplete();
                    }
                }
            }));
        });
    };

    Teamtools.sessionId = function (val) {

        if (val) {

            Teamtools._sessionId = val;
            Teamtools.client.update({'id': Teamtools.id}, {'$set': {"session": val}})
            _.each(Teamtools.listeners, function (context) {
                Teamtools.listeners[context.id].invalidate();
            });
        }
        else {
            // do deps stuff
            var context = Meteor.deps.Context.current;
            if (context && !Teamtools.listeners[context.id]) {
                Teamtools.listeners[context.id] = context;
                context.onInvalidate(function () {
                    delete Teamtools.listeners[context.id];
                });
            }

            return Teamtools._sessionId;
        }

    }

    Teamtools.usersInSession = function (sessionId) {

        if (Meteor.user()) {
            var clients = Teamtools.client.find({
                'session': sessionId
            });
            //console.log('clients length');
            //console.log(clients.count());
            var userclients = _.uniq(clients.fetch(), false, function (client) {
                return client.user;
            });

            var session = Teamtools.session.findOne(sessionId);
            if (session) {
                var d = [];
                _.each(userclients, function (client) {

                    if (session.speaker == client.user) {
                        client.speaker = true;
                    }
                    d.push(client);

                });
                //console.log('data');
                //console.log(d);
                return d;
            }
        }
        return [];
    }

    Teamtools.register = function () {
        // clean up first
        console.log('register called')
        Teamtools.unregister();
        Teamtools.id = Meteor.uuid();
        Teamtools.subscriptions = [];
        Teamtools.subs.load({
            'subs': [
                {
                    'key': Teamtools.SESSION_COLLECTION,
                    'callback': function () {
                        console.log('Subscribed to Teamtools session collection');
                    }
                },
                {
                    'key': Teamtools.CLIENT_COLLECTION,
                    'callback':  function () {
                        console.log('Subscribed to Teamtools client collection');
                    }
                }
            ],
            'onComplete': function () {
                if (Meteor.userId()) {
                    console.log('starting ping');
                    Teamtools.first_ping = true;
                    Teamtools.sessionId(Teamtools.session.findOne({
                        'default': true,
                    }));
                    var start_call = new Date().getTime();
                    Meteor.call(Teamtools.TIME_METHOD, function (err, result) {
                        Teamtools.latency = new Date().getTime() - start_call;
                        Teamtools.time = result;
                        Teamtools.id = Meteor.uuid();
                        Teamtools._ping();
                        Teamtools.register.handle = Meteor.setInterval(
                            Teamtools._ping,
                            Teamtools.interval
                        );
                    });
                }
            }
        });
    }

    Teamtools.unregister = function () {
        if (Teamtools.register.handle) {
            Meteor.clearInterval(Teamtools.register.handle);
        }
        if (_.isArray(Teamtools.subscriptions)) {
            _.each(Teamtools.subscriptions, function (sub) {
                sub.stop();
            });
            Teamtools.subscriptions = undefined;
        }
    }

    Teamtools._ping = function () {
        Teamtools.counter++;
        if (Teamtools.counter > Teamtools.sync_frequency) {
            // if nth loop without time update
            Teamtools.counter = 0;
            var start_call = new Date().getTime();
            Meteor.call(Teamtools.TIME_METHOD, function (err, result) {
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
                        'username': Meteor.user().username,
                        'session': Teamtools.sessionId()
                    }});
            } 
            else {
                Teamtools.client.insert({
                    'id': Teamtools.id, 
                    'last_ping': Teamtools.time, 
                    'latency': Teamtools.latency, 
                    'user': Meteor.userId(),
                    'username': Meteor.user().username,
                    'session': Teamtools.sessionId()
                // }, function (err, id) {
                //     if (Teamtools.first_ping) {
                //         Teamtools.sessionId(Teamtools._sessionId);
                //         Teamtools.first_ping = false;
                //     }
                });
            }
        }
    }

    Meteor.startup(function () {

        // set up autorun to toggle registration at login
        Meteor.autorun(function () {
            var u = Meteor.user();
            if (u && u.username) {
                Teamtools.register();
            }
            else {
                Teamtools.unregister();
            }
        });

    });
}