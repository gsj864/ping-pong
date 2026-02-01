/**
 * Challenge Mode – 20 challenges (Beginner 1–6, Intermediate 7–14, Advanced 15–20)
 * 재활용: 점수, 타이머, 공속도, AI 난이도. 조건 검사만 여기서.
 */
(function (global) {
  'use strict';

  var TIER = { beginner: 1, intermediate: 2, advanced: 3 };

  var CHALLENGES = [
    { id: 1, name: 'First Point', tier: 'beginner', stageDifficulty: 'easy', winScore: 1,
      description: 'Score 1 point before the AI does.',
      check: function (s) { return s.win && s.playerScore >= 1; } },
    { id: 2, name: 'Safe Win', tier: 'beginner', stageDifficulty: 'easy', winScore: 3,
      description: 'Win without giving the AI any point. One goal for AI = instant fail.',
      check: function (s) { return s.win && s.playerScore >= 3 && s.aiScore === 0; } },
    { id: 3, name: 'Rally 5', tier: 'beginner', stageDifficulty: 'easy', winScore: 3,
      description: 'Hit the ball 5 times in a row without missing.',
      check: function (s) { return s.maxRallyCount >= 5; } },
    { id: 4, name: 'Calm Start', tier: 'beginner', stageDifficulty: 'easy', winScore: 5,
      description: 'Don\'t miss the ball for the first 20 seconds.',
      check: function (s) { return s.survivalTimeSec >= 20; } },
    { id: 5, name: 'Easy Break', tier: 'beginner', stageDifficulty: 'easy', winScore: 5,
      description: 'Win one game against Easy AI.',
      check: function (s) { return s.difficulty === 'easy' && s.win; } },
    { id: 6, name: 'Quick Match', tier: 'beginner', stageDifficulty: 'easy', winScore: 1,
      description: 'Score 1 point within 30 seconds.',
      check: function (s) { return s.playerScore >= 1 && s.matchTimeSec <= 30; } },
    { id: 7, name: 'Rally 20', tier: 'intermediate', stageDifficulty: 'normal', winScore: 5,
      description: 'Hit the ball 20 times in a row without missing.',
      check: function (s) { return s.maxRallyCount >= 20; } },
    { id: 8, name: 'No Mercy', tier: 'intermediate', stageDifficulty: 'normal', winScore: 3,
      description: 'Score 3 points without giving the AI a single point. One goal for AI = instant fail.',
      check: function (s) { return s.win && s.aiScore === 0 && s.playerScore >= 3; } },
    { id: 9, name: 'Survivor 30', tier: 'intermediate', stageDifficulty: 'normal', winScore: 5,
      description: 'Survive for 30 seconds without missing.',
      check: function (s) { return s.survivalTimeSec >= 30; } },
    { id: 10, name: 'Comeback', tier: 'intermediate', stageDifficulty: 'normal', winScore: 3,
      description: 'Win from 0-2 deficit. Score 3 points.',
      check: function (s) { return s.win && s.playerScore >= 3; } },
    { id: 11, name: 'Speed Up', tier: 'intermediate', stageDifficulty: 'normal', winScore: 3,
      description: 'Score 3 points with ball at 1.3x speed.',
      check: function (s) { return s.win && s.playerScore >= 3; } },
    { id: 12, name: 'Precision 10', tier: 'intermediate', stageDifficulty: 'normal', winScore: 5,
      description: 'Hit the paddle center 10 times.',
      check: function (s) { return s.centerHitCount >= 10; } },
    { id: 13, name: 'First to 10', tier: 'intermediate', stageDifficulty: 'normal', winScore: 10,
      description: 'Win one game. First to 10 points.',
      check: function (s) { return s.win && s.playerScore >= 10; } },
    { id: 14, name: 'Normal Crusher', tier: 'intermediate', stageDifficulty: 'normal', winScore: 5,
      description: 'Win against Normal AI.',
      check: function (s) { return s.difficulty === 'normal' && s.win; } },
    { id: 15, name: 'Rally 20', tier: 'advanced', stageDifficulty: 'hard', winScore: 5,
      description: 'Hit the ball 20 times in a row without missing.',
      check: function (s) { return s.maxRallyCount >= 20; } },
    { id: 16, name: 'Survivor 50', tier: 'advanced', stageDifficulty: 'hard', winScore: 5,
      description: 'Survive for 50 seconds without missing.',
      check: function (s) { return s.survivalTimeSec >= 50; } },
    { id: 17, name: 'Perfect Game', tier: 'advanced', stageDifficulty: 'hard', winScore: 10,
      description: 'Score 10 points without giving the AI 3 or more.',
      check: function (s) { return s.win && s.playerScore >= 10 && s.aiScore <= 2; } },
    { id: 18, name: 'Speed Demon', tier: 'advanced', stageDifficulty: 'hard', winScore: 3,
      description: 'Score 3 points with ball at 1.5x speed.',
      check: function (s) { return s.win && s.playerScore >= 3; } },
    { id: 19, name: 'Hard Breaker', tier: 'advanced', stageDifficulty: 'hard', winScore: 5,
      description: 'Win against Hard AI.',
      check: function (s) { return s.difficulty === 'hard' && s.win; } },
    { id: 20, name: 'Rally 50', tier: 'advanced', stageDifficulty: 'normal', winScore: 5,
      description: 'Hit the ball 50 times in a row without missing.',
      check: function (s) { return s.maxRallyCount >= 50; } }
  ];

  function getChallenge(id) {
    for (var i = 0; i < CHALLENGES.length; i++) {
      if (CHALLENGES[i].id === id) return CHALLENGES[i];
    }
    return null;
  }

  function getChallengesByTier(tier) {
    return CHALLENGES.filter(function (c) { return c.tier === tier; });
  }

  function getTierOrder(tier) {
    return TIER[tier] || 0;
  }

  function isUnlocked(challengeId, completedIds) {
    var c = getChallenge(challengeId);
    if (!c) return false;
    var myTier = getTierOrder(c.tier);
    for (var i = 0; i < CHALLENGES.length; i++) {
      var other = CHALLENGES[i];
      if (other.id === challengeId) return true;
      if (getTierOrder(other.tier) < myTier && completedIds.indexOf(other.id) === -1) return false;
    }
    return true;
  }

  function isUnlockedSimple(challengeId, completedIds) {
    var c = getChallenge(challengeId);
    if (!c) return false;
    if (c.tier === 'beginner') return true;
    if (c.tier === 'intermediate') {
      var beginnerCount = CHALLENGES.filter(function (x) { return x.tier === 'beginner'; }).length;
      return completedIds.length >= beginnerCount;
    }
    if (c.tier === 'advanced') {
      var intermediateCount = CHALLENGES.filter(function (x) { return x.tier === 'intermediate'; }).length;
      return completedIds.length >= 6 + intermediateCount;
    }
    return true;
  }

  function checkComplete(challengeId, state) {
    var c = getChallenge(challengeId);
    if (!c || !c.check) return false;
    return c.check(state);
  }

  global.ChallengeMode = {
    CHALLENGES: CHALLENGES,
    getChallenge: getChallenge,
    getChallengesByTier: getChallengesByTier,
    getTierOrder: getTierOrder,
    isUnlocked: isUnlockedSimple,
    checkComplete: checkComplete,
    TIER: TIER
  };
})(typeof window !== 'undefined' ? window : this);
