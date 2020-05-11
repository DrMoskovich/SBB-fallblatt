const colors = require('colors');
const vorpal = require('vorpal')();
const fs = require('fs');
const ModuleController = require('./moduleController');
const path=require("path");

module.exports = class Module extends ModuleController {
  constructor(address, type) {
    super(address, 0);

    this.type = type;
    this.randomDuration = 10000
    this.randomVariation = 0;
    this.switchMode('static');
    this.loadMessagesMapping(address);
  }

  loadMessagesMapping(address) {
    this.messages = require('../config/modules-mapping/' + address.toString().padStart(2, '0') + '.json');

    this.bladeCount = this.messages.length;
  }

  switchMode(mode) {
    this.mode = mode;

    global.server.io.emit('mode', {mode: this.mode});
  }

  message() {
    return this.messages[this.position];
  }

  list(address) {
    this.loadMessagesMapping(address);
    return this.messages;
  }

  find(address, target) {
    var found = false;
    var messageIndex = 0;

    this.random('stop');

    this.loadMessagesMapping(address);

    this.messages.forEach(function(message, index) {
      if (message == target && !found) {
        messageIndex = index;
        found = true;
      }
    });

    if (found) this.move(address, messageIndex);

    return found;
  }

  move(address, position) {
    this.random('stop');
    super.move(address, position);
  }

  random(action, duration = 10000, variation = 0) {
    this.randomDuration = duration
    this.randomVariation = variation;

    switch (action) {
      case 'start':
        clearTimeout(this.randomTimeout);
        clearTimeout(this.turnTimeout);
        clearTimeout(this.timeTimeout);
        this.selectRandomPosition(duration, variation);
        this.switchMode('random');
        break;
      case 'stop':
        clearTimeout(this.randomTimeout);
        this.switchMode('static');
        break;
    }
  }

  selectRandomPosition() {
    this.randomTimeout = setTimeout(() => {
      for (var address of [0,1,2,3,4,5]) {
        let index = this.findRandomMessage();
        super.move(address, index);
      }
      this.selectRandomPosition();
    }, this.randomDuration + Math.floor(Math.random() * this.randomVariation));
  }

  findRandomMessage() {
    let isEmpty = true;
    let index = Math.floor(Math.random() * this.messages.length);

    while(isEmpty) {
      var message = this.messages[index].trim();

      if (message) {
        isEmpty = false;
      } else {
        index = Math.floor(Math.random() * this.messages.length);
      }
    }

    return index;
  }

  turn(action, duration = 10000, variation = 0) {
    this.turnDuration = duration
    this.turnVariation = variation;

    switch (action) {
      case 'start':
        clearTimeout(this.randomTimeout);
        clearTimeout(this.turnTimeout);
        clearTimeout(this.timeTimeout);
        this.turnPosition(duration, variation);
        this.switchMode('turn');
        break;
      case 'stop':
        clearTimeout(this.turnTimeout);
        this.switchMode('static');
        break;
    }
  }

  turnPosition() {
    this.turnTimeout = setTimeout(() => {
      super.step();

      this.turnPosition();
    }, this.turnDuration + Math.floor(Math.random() * this.turnVariation));
  }

  time(action) {
    switch (action) {
      case 'start':
        clearTimeout(this.randomTimeout);
        clearTimeout(this.turnTimeout);
        clearTimeout(this.timeTimeout);

        this.updateTime();

        // update on second 0
        var seconds = new Date().getSeconds();
        var diff = 60-seconds;
        setTimeout(() => {
          this.displayTime();
        }, diff*1000);

        this.switchMode('time');
        break;
      case 'stop':
        clearTimeout(this.timeTimeout);
        this.switchMode('static');
        break;
    }
  }

  displayTime() {
    this.updateTime();
    // then update every 60 seconds
    this.timeTimeout = setTimeout(() => {
      this.displayTime();
    }, 60000);
  }

  updateTime() {
    // display current time
    var today = new Date();
    var hour = today.getHours();
    var minutes = today.getMinutes();
    var min_position = this.minutesToPosition(minutes);
    // set position
    super.move(0x00, hour);
    super.move(0x01, min_position);
  }

  minutesToPosition(minutes) {
    // convert minute to module position
    var position = (minutes + 31)%62;
    if (minutes < 31) {
        position = position - 1;
    };
    return position;
  }

  timetable(action) {
    switch (action) {
      case 'start':
        clearTimeout(this.timeTimeout);
        clearTimeout(this.timetableTimeout);

         // display timetable
        this.displayTimetable();
        // update on second 0
        var seconds = new Date().getSeconds();
        var diff = 60-seconds;
        setTimeout(() => {
          this.displayTimetable();
        }, diff*1000);
        this.switchMode('timetable');
        break;
      case 'stop':
        clearTimeout(this.timetableTimeout);
        this.switchMode('static');
        break;
    }

  }

  loadTimetable() {
    var timetable = require('../config/timetable.json');
    // delete module cache to reload updated file every time
    delete require.cache[require.resolve('../config/timetable.json')];

    return timetable;
  }

  displayTimetable() {
    // set timetable
    var interval = this.updateTimetable();

    // update timetable after every interval
    this.timetableTimeout = setTimeout(() => {
      interval = this.displayTimetable();
    }, interval*60000);
  }

  updateTimetable() {
    let today = new Date();
    let hour = today.getHours();
    let minute = today.getMinutes();

    // load and sort timetable by hour and minute
    let timetable = this.loadTimetable();
    timetable.timetable.sort(function (a, b) {
      let aSize = parseInt(a.hour);
      let bSize = parseInt(b.hour);
      let aLow = parseInt(a.minute);
      let bLow = parseInt(b.minute);

      if(aSize == bSize) { return (aLow < bLow) ? -1 : (aLow > bLow) ? 1 : 0;
      } else { return (aSize < bSize) ? -1 : 1; }
    });

    // get all hours an minutes of the schedule
    let schedule_minutes  = [];
    let schedule_hours = [];
    timetable.timetable.forEach(element => {
      schedule_minutes.push(element.minute);
      schedule_hours.push(element.hour);
    });

    // get index of next hour and minute
    let next_index_hour = schedule_hours.findIndex(element => element >= hour);
    let next_index_minute = schedule_minutes.slice(next_index_hour).findIndex(element => element > minute);
    // if no minute found (-1) restart looking from 0 starting at next hour
    if (next_index_minute < 0) {
      next_index_hour = schedule_hours.findIndex(element => element >= hour + 1);
      next_index_minute = schedule_minutes.slice(next_index_hour).findIndex(element => element > -1);
    }
    // if no hour found (-1) restart looking from hour 0
    if (next_index_hour < 0) {
      next_index_hour = schedule_hours.findIndex(element => element >= -1);
      next_index_minute = schedule_minutes.slice(next_index_hour).findIndex(element => element > -1);;
    }
    // add hour index because we sliced
    next_index_minute = next_index_minute + next_index_hour;

    let next_index = next_index_minute;

    // display timetable
    this.find(0, timetable.timetable[next_index].hour);
    this.find(1, timetable.timetable[next_index].minute);
    this.find(2, timetable.timetable[next_index].delay);
    this.find(3, timetable.timetable[next_index].train);
    this.find(4, timetable.timetable[next_index].via);
    this.find(5, timetable.timetable[next_index].destination);

    let next_schedule_minutes = timetable.timetable[next_index].minute;
    let next_schedule_hours = timetable.timetable[next_index].hour;

    // get time difference to next update
    let now = new Date(2000, 0, 1,  hour, minute);
    let next_schedule = new Date(2000, 0, 1, next_schedule_hours, next_schedule_minutes);
    // add one day if overnight
    if (next_schedule < now) {
      next_schedule.setDate(next_schedule.getDate() + 1);
    }
    let diff = next_schedule - now;

    // return time until next change in schedule + 1 minute
    return Math.floor(diff / 1000 / 60) + 1;
  }

};
