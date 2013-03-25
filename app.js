var express = require('express'),
    config = require('./config'),
    http = require('http'),
    path = require('path'),
    fs = require('fs'),
    sprintf = require('sprintf').sprintf,
    qs = require('qs'),
    request = require('request');

var app = express();

app.configure(function(){
  app.set('port', config.port || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(setHeaders);
  app.use(prepareRequest);
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(errorResponse);
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.locals({
  base: config.base,
  urlroot: '/demo',
  lcvcUid: function(obj) {
    return sprintf('%s-%03d', obj.lc, obj.vc);
  }
});

loadLanguages();

app.get('/', index);
app.post('/1', op1);
app.post('/2', op2);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

function loadLanguages() {
  var lgs = {};
  
  fs.readdirSync(path.join(__dirname, 'i18n')).forEach(function (file) {
    if (!file.match(/\.json$/)) return;
    var lg = file.replace(/\.json/, '');
    lgs[lg] = require(path.join(__dirname, 'i18n', file));
    lgs[lg].lc = lg;
  });
  
  app.set('lgs', lgs);
}

function setHeaders(req, res, next) {
  res.set('Expires', 0);
  next();
}

function prepareRequest(req, res, next) {
  var lgs = app.get('lgs'),
      lg = req.query.lg || 'eng';
    
  if (lgs[lg] === undefined) next('TeraDict error: unknown language "' + lg + '"');
  
  res.locals.lg = res.lg = lgs[lg];
  res.locals.subheading = res.lg.teradict_description;
  res.locals.qs = makeQuery(req, res);
  
  for (var i in req.body) {
    if (req.body[i] !== undefined) {
      req.body[i] = req.body[i].trim();
      res.locals[i] = req.body[i];
    }
  }
  
  next();
}

function makeQuery(req) {
    return function(p) {
        var txt;
        if (p) {
          var query = {};
          for (var i in req.query) query[i] = req.query[i];
          for (var i in p) {
              if (p[i] === undefined) delete query[i];
              else query[i] = p[i];
          }
          txt = qs.stringify(query);        
        }
        else txt = qs.stringify(req.query);
        
        if (txt !== '') txt = '?' + txt;
        return txt;
    }
}

function errorResponse(err, req, res, next) {
  res.render('error', { error: err });
}

function index(req, res, next) {
  res.render('index', { et0: '' });
}

function op1(req, res, next) {
  if (blank(req.body, ['et0'])) return res.render('index');
  var et0 = req.body.et0;
  
  apiRequest('/ex', { lv: [res.lg.lv], tt: [et0] }, function (err, data) {
    if (err) return next(err);
    if (data.resultNum === 0) return res.render('index', { subheading: res.lg.ex_not_found});
    
    var ex0 = data.result[0].ex;
    apiRequest('/lv', { tr: [ex0], sort: ["tt"] }, function (err, data) {
      if (err) return next(err);
      if (data.resultNum === 0) res.render('index', { subheading: res.lg.tr_not_found });
      else res.render('op1', { result: data.result, ex0: ex0 });
    });
  });
}

function op2(req, res, next) {
  if (blank(req.body, ['et0', 'ex0', 'lv1']))
    return next('TeraDict error: missing required parameter');

  var ex0 = Number(req.body.ex0),
      lv1 = res.locals.lv1 = JSON.parse(req.body.lv1);
  
  apiRequest('/tr', { ex: [ex0], lv: [lv1.lv], sort: ["tt"] }, function (err, data) {
    if (err) return next(err);
    res.render('op2', { result: data.result });
  });
}

function apiRequest(url, body, cb) {
  request({ url: config.api + url, json: body, method: 'POST' },
    function (err, res, body) {
      if (err) cb('HTTP error: ' + err);
      else if (res.statusCode != 200) cb('HTTP error: got status code ' + res.statusCode);
      else {
        if (body.status === 'error') cb('PanLex API error: ' + body.error);
        cb(null, body);
      }
    });  
}

function blank(obj, params) {
  params.forEach(function (item) {
    if (obj[item] === undefined || obj[item] === '') return true;
  });
  return false;
}