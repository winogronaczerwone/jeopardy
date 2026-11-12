'use strict';

angular.module('myApp.controllers').
  controller('BoardCtrl', function ($scope, $timeout, $modal, socket) {
    $scope.fullscreenPromptVisible = true;

    function updateFullscreenState () {
      var isFullscreen = Boolean(document.fullscreenElement);
      $scope.fullscreenPromptVisible = !isFullscreen;
      $scope.$applyAsync();
      socket.emit('fullscreen:state', isFullscreen);
    }

    $scope.enterFullscreen = function () {
      if (!document.documentElement.requestFullscreen) {
        return;
      }
      var request = document.documentElement.requestFullscreen();
      if (request) {
        request.catch(function () {
          $scope.fullscreenPromptVisible = true;
          $scope.$applyAsync();
        });
      }
    };

    document.addEventListener('fullscreenchange', updateFullscreenState);
    socket.on('fullscreen:prompt', function () {
      $scope.fullscreenPromptVisible = true;
      $scope.$applyAsync();
    });

    function controlMusic (command) {
      var iframe = document.getElementById('tv-intro-video');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: command,
          args: []
        }), '*');
      }
    }

    socket.emit('board:init');

    socket.on('board:init', function (data) {
      console.log('board:init ' + !!data);
      if (data) {
        $scope.data = data.data;
        $scope.game = data.game;
        $scope.scoreHtml = buildScores();
        $timeout(function () {
          controlMusic('playVideo');
        }, 0);
      }
    })

    socket.on('music:command', function (command) {
      controlMusic(command);
    });

    function buildScores () {
      return '<div class="row">' +
          '<div class="col-md-4 text-center">' +
            '<div class="player-name">' +
              (($scope.game.player_1 && $scope.game.player_1.name) || 'Player 1') +
            '</div><div class="player-score">' +
              (($scope.game.player_1 && $scope.game.player_1.score) || 0) +
            '</div>' +
          '</div>' +
          '<div class="col-md-4 text-center">' +
            '<div class="player-name">' +
              (($scope.game.player_2 && $scope.game.player_2.name) || 'Player 2') +
            '</div><div class="player-score">' +
              (($scope.game.player_2 && $scope.game.player_2.score) || 0) +
            '</div>' +
          '</div>' +
          '<div class="col-md-4 text-center">' +
            '<div class="player-name">' +
              (($scope.game.player_3 && $scope.game.player_3.name) || 'Player 3') +
            '</div><div class="player-score">' +
              (($scope.game.player_3 && $scope.game.player_3.score) || 0) +
            '</div>' +
          '</div>' +
        '</div>';
    }

    socket.on('round:start', function (data) {
      console.log('round:start');
      if (modalInstance) {
        modalInstance.close();
      }

      $scope.data = data.data;
      $scope.game = data.game;

      if (!data.game.round) {
        $timeout(function () {
          controlMusic('playVideo');
        }, 0);
      }
      else if (data.game.round === 'DJ') {
        openModal();
        $timeout(modalInstance.close, 5000);
      }
      else if (data.game.round === 'FJ') {
        $scope.scoreHtml = buildScores();
      }
      else if (data.game.round === 'end') {
        openModal();
      }
    });

    var modalInstance;
    function openModal (id) {
      if (modalInstance) {
        modalInstance.close();
      }

      modalInstance = $modal.open({
        templateUrl: 'partials/boardclue',
        controller: 'BoardClueCtrl',
        backdrop: 'static',
        size: 'lg',
        openedClass: 'board-modal-open',
        resolve: {
          response: function () {
            return {
              id: id,
              clue: $scope.data[id],
              game: $scope.game,
              scoreHtml: buildScores()
            };
          }
        }
      });
    };

    socket.on('clue:start', function (data) {
      console.log('clue:start ' + data);
      openModal(data);
    });

    socket.on('clue:end', function (data) {
      console.log('clue:end');
      $scope.game = data;
      if (modalInstance) {
        modalInstance.close();
      }
    });
  });
