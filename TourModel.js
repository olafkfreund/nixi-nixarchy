// Tour and learning-path logic for the Nixi overlay, kept Qt-free so it can be
// unit tested under node (bridge/tour-model.test.js) -- the same shape as
// Omarchy's own KeyboardLayoutModel.js. Every function returns new state rather
// than mutating its input, so QML can assign the result and a test can compare.
//
// The step content and matcher format live in share/tour.json and
// share/learn.json; see the "matchers" block there.

function idle() {
  return { active: false, step: 0, hits: 0, finished: false }
}

function start(tour) {
  return { active: true, step: 0, hits: 0, finished: false, total: tour.steps.length }
}

function currentStep(state, tour) {
  if (!state || !state.active || !tour || !tour.steps) return null
  return tour.steps[state.step] || null
}

function currentText(state, tour) {
  var step = currentStep(state, tour)
  return step ? String(step.text || "") : ""
}

// One Hyprland socket2 event against one step's matcher. `classAny` compares
// whole comma-separated fields of the event data (openwindow is
// "address,workspace,class,title"); `dataContainsAny` is a substring anywhere.
function stepMatches(match, eventName, eventData) {
  if (!match || !match.event || match.event !== eventName) return false
  var data = String(eventData || "")
  var lower = data.toLowerCase()
  if (match.classAny) {
    var fields = lower.split(",")
    var wanted = match.classAny.map(function(c) { return String(c).toLowerCase() })
    if (!fields.some(function(f) { return wanted.indexOf(f) !== -1 })) return false
  }
  if (match.dataContainsAny) {
    if (!match.dataContainsAny.some(function(s) { return lower.indexOf(String(s).toLowerCase()) !== -1 }))
      return false
  }
  return true
}

function advance(state, tour) {
  var next = Object.assign({}, state, { step: state.step + 1, hits: 0 })
  if (next.step >= tour.steps.length) {
    next.active = false
    next.finished = true
  }
  return next
}

// A counted hit on the current step; advances once `count` is reached.
function hit(state, tour) {
  var step = currentStep(state, tour)
  var hits = state.hits + 1
  if (hits >= (step.count || 1)) return advance(state, tour)
  return Object.assign({}, state, { hits: hits })
}

function onEvent(state, tour, eventName, eventData) {
  var step = currentStep(state, tour)
  if (!step || !stepMatches(step.match, eventName, eventData)) return state
  return hit(state, tour)
}

// `checks` holds live facts, e.g. { defaultAgent: true }. Several consecutive
// check steps that already pass all complete at once.
function onCheck(state, tour, checks) {
  var next = state
  var step = currentStep(next, tour)
  while (step && step.match && step.match.check && checks && checks[step.match.check] === true) {
    next = advance(next, tour)
    step = currentStep(next, tour)
  }
  return next
}

// The card was summoned. Only a step that asks for it completes.
function onOpened(state, tour) {
  var step = currentStep(state, tour)
  if (!step || !step.match || step.match.self !== "opened") return state
  return hit(state, tour)
}

function isDone(topic, learning) {
  var taught = (learning && learning.taught) || {}
  var observed = (learning && learning.observed) || {}
  return Object.prototype.hasOwnProperty.call(taught, topic.id)
    || (!!topic.observe && Object.prototype.hasOwnProperty.call(observed, topic.observe))
}

function nextTopic(learn, learning) {
  var topics = (learn && learn.topics) || []
  for (var i = 0; i < topics.length; i++)
    if (!isDone(topics[i], learning)) return topics[i]
  return null
}

function markTaught(learning, topicId, now) {
  var base = learning && typeof learning === "object" ? learning : {}
  var taught = Object.assign({}, base.taught || {})
  taught[topicId] = now
  return Object.assign({}, base, { taught: taught })
}

function progress(learn, learning) {
  var topics = (learn && learn.topics) || []
  var done = topics.filter(function(t) { return isDone(t, learning) }).length
  return { done: done, total: topics.length }
}

if (typeof module !== "undefined") {
  module.exports = {
    idle: idle,
    start: start,
    currentText: currentText,
    stepMatches: stepMatches,
    onEvent: onEvent,
    onCheck: onCheck,
    onOpened: onOpened,
    nextTopic: nextTopic,
    markTaught: markTaught,
    progress: progress
  }
}
