/*
 * Serve JSON to our AngularJS client
 */

var request = require('request');
var cheerio = require('cheerio');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var customGamesDirectory = path.join(__dirname, '..', 'custom-games');

function customGameFiles() {
  if (!fs.existsSync(customGamesDirectory)) {
    return [];
  }
  return fs.readdirSync(customGamesDirectory)
    .filter(function (name) { return path.extname(name) === '.json'; });
}

function customGameId(filename) {
  return path.basename(filename, '.json');
}

function loadCustomGame(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }
  var filename = path.join(customGamesDirectory, id + '.json');
  if (!fs.existsSync(filename)) {
    return null;
  }
  var game = JSON.parse(fs.readFileSync(filename, 'utf8'));
  var result = {
    id: 'custom-' + id,
    game_title: game.title || id,
    game_comments: game.description || '',
    game_complete: true
  };

  ['J', 'DJ'].forEach(function (round) {
    var categories = (game.rounds && game.rounds[round]) || [];
    categories.forEach(function (category, categoryIndex) {
      var categoryKey = 'category_' + round + '_' + (categoryIndex + 1);
      result[categoryKey] = {
        category_name: category.name || ('Category ' + (categoryIndex + 1)),
        category_comments: category.comments || '',
        clue_count: (category.clues || []).length
      };
      (category.clues || []).forEach(function (clue, clueIndex) {
        result['clue_' + round + '_' + (categoryIndex + 1) + '_' + (clueIndex + 1)] = {
          clue_text: clue.question,
          clue_html: clue.question,
          correct_response: clue.answer,
          daily_double: Boolean(clue.daily_double),
          triple_stumper: Boolean(clue.triple_stumper)
        };
      });
    });
  });

  var final = game.rounds && game.rounds.FJ;
  if (final) {
    result.category_FJ_1 = {
      category_name: final.category || 'Final Jeopardy!',
      category_comments: final.comments || ''
    };
    result.clue_FJ = {
      clue_text: final.question,
      clue_html: final.question,
      correct_response: final.answer
    };
  }
  return result;
}

exports.customGames = function (req, res) {
  var games = customGameFiles().map(function (filename) {
    var game = loadCustomGame(customGameId(filename));
    return {
      id: game.id,
      name: game.game_title,
      description: game.game_comments
    };
  });
  res.json(games);
};

exports.customGame = function (req, res) {
  var game = loadCustomGame(req.params.id);
  if (!game) {
    return res.status(404).json({ error: 'Custom game not found' });
  }
  res.json(game);
};

function exportIndex (req, res, next) {
  return function (error, response, html) {
    if (!error) {
      var $ = cheerio.load(html), result = [];
      $('#content table tr').each(function () {
        var data = $(this), row = [];
        data.children().each(function (i, element) {
          if (i == 0) {
            var link = $('a', element).first().attr('href');
            link = link.substring(link.indexOf('=') + 1, link.length)
            row.push(link);
          }
          row.push($(element).text().trim());
				});

        result.push(_.zipObject(['id', 'name', 'description', 'note'], row));
      });

      res.json(result);
    }
    else {
      next(error);
    }
  };
}

function exportRound ($, context, r) {
  var result = {};
  var round = $(r !== 'FJ' ? 'table.round' : 'table.final_round', context);

  // Export categories
  $('tr', round).first().children().each(function (i, element) {
    var data = $(this);
    result[['category', r, i + 1].join('_')] = {
      category_name: $('.category_name', data).text(),
      category_comments: $('.category_comments', data).text(),
      media: $('a', data).length ? $('a', data).map(function (i, element) {
        return $(this).attr('href').replace('http://www.j-archive.com/', 'http://localhost:3000/');
      }).toArray() : undefined
    };
  });

  // Export clues
  $('.clue_text', round).not('[id$="_r"]').each(function (i, element) {
    var data = $(this);
    var header = data.parent().prev();
    if (r === 'FJ') {
      header = data.parent().parent().parent().parent().prev();
    }

    var answer = $('#' + data.attr('id') + '_r', data.parent());
    var link = $('.clue_order_number a', header).attr('href');
    var daily_double = header.find('.clue_value_daily_double').length;

    result[data.attr('id')] = {
      id: link ? link.substring(link.indexOf('=') + 1, link.length) : undefined,
      daily_double: daily_double ? true : undefined,
      triple_stumper: _.contains(answer.html(), 'Triple Stumper') || undefined,
      clue_html: data.html(),
      clue_text: data.text(),
      correct_response: $('.correct_response', answer).text(),
      media: $('a', data).length ? $('a', data).map(function (i, element) {
        return $(this).attr('href').replace('http://www.j-archive.com/', 'http://localhost:3000/');
      }).toArray() : undefined
    };
  });

  return result;
}

exports.seasons = function (req, res, next) {
  request({
    url: 'http://www.j-archive.com/listseasons.php',
    headers: {
      'User-Agent': req.get('User-Agent')
    }
  }, exportIndex(req, res, next));
};

exports.season = function (req, res, next) {
  request({
    url: 'http://www.j-archive.com/showseason.php?season=' + req.params.id,
    headers: {
      'User-Agent': req.get('User-Agent')
    }
  }, exportIndex(req, res, next));
}

exports.game = function (req, res, next) {
  request({
    url: 'http://www.j-archive.com/showgame.php?game_id=' + req.params.id,
    headers: {
      'User-Agent': req.get('User-Agent')
    }
  }, function (error, response, html) {
    if (!error) {
      var $ = cheerio.load(html);

      var result = {
        id: req.params.id,
        game_title: $('#game_title').text(),
        game_comments: $('#game_comments').text(),
        game_complete: false
      };

      _.assign(result,
        exportRound($, $('#jeopardy_round'), 'J'),
        exportRound($, $('#double_jeopardy_round'), 'DJ'),
        exportRound($, $('#final_jeopardy_round'), 'FJ'));

      result.game_complete = _.countBy(_.keys(result), function (n) {
        return n.split('_')[0];
      }).clue === (30 + 30 + 1);

      var clueCounts = _.countBy(_.keys(result), function (n) {
        return n.split('_').slice(0, 3).join('_');
      });

      _.forEach(result, function (n, key) {
        if (_.startsWith(key, 'category')) {
          n.clue_count = clueCounts[key.replace('category', 'clue')];
        }
      });

      res.json(result);
    }
    else {
      next(error);
    }
  });
}
