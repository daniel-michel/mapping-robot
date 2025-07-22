#pragma once
#include "Arduino.h"
#include "helper.h"
#include <Stepper.h>
#include <Servo.h>

void set_sensor_direction(float direction);

const int stepsPerRevolution = 2048;
const int stepper_speed = 10;
const int servo_pint = 2;
// rpm = (steps / steps-per-rotation) / time(min)
// time(min) = (steps / steps-per-rotation) / rpm
const float time_per_step_ms = 60.0 * 1000.0 / (float)stepsPerRevolution / (float)stepper_speed;

Stepper left_motor = Stepper(stepsPerRevolution, 9, 11, 10, 12);
Stepper right_motor = Stepper(stepsPerRevolution, 4, 6, 5, 7);
Servo sensor_servo;
float current_servo_position = 0.0;

void init_motors() {
  left_motor.setSpeed(stepper_speed);
  right_motor.setSpeed(stepper_speed);
  sensor_servo.attach(2);

  set_sensor_direction(0);
}

// direction is expected to be a value between -1 and 1
void set_sensor_direction(float direction) {
  if (direction > 1 || direction < -1) {
    Serial.println("err Sensor direction out of range");
    return;
  }

  // calibration values for the specific servo motor
  float left_most = 0.3;
  float center = -0.25;
  float right_most = -0.9;

  float adjusted_value = direction < 0.0 ? map(direction, -1, 0, left_most, center)
                                         : map(direction, 0, 1, center, right_most);

  int microseconds = (adjusted_value + 2) * 1000;

  float dir_diff = abs(direction - current_servo_position);

  sensor_servo.writeMicroseconds(microseconds);
  float speed = 60.0 / 170.0; // it takes 170 milliseconds to rotate 60 degrees (in the spec sheet it is 100 milleseconds for 60 degrees)
  delay((int)((dir_diff / 2 * 135) / speed) + 100); // add 100 milliseconds to ensure it has stopped
  current_servo_position = direction;
}

void rotate_left(int steps) {
  left_motor.step(steps);
}

void rotate_right(int steps) {
  right_motor.step(-steps);
}

void rotate_both(int left, int right) {
  left_motor.step(left);
  right_motor.step(-right);
}

// void rotate_motors(int steps_left, int steps_right) {
//   float ratio = (float)abs(steps_left) / (float)(abs(steps_left) + abs(steps_right));
//   while (steps_left != 0 || steps_right != 0) {
//     if (steps_left == 0) {
//       rotate_right(steps_right);
//       return;
//     }
//     if (steps_right == 0) {
//       rotate_left(steps_left);
//       return;
//     }
//     float curr_ratio = (float)abs(steps_left) / (float)(abs(steps_left) + abs(steps_right));
//     if (curr_ratio > ratio) {
//       // move left
//       int step = sign(steps_left);
//       rotate_left(step);
//       steps_left -= step;
//     } else {
//       // move right
//       int step = sign(steps_right);
//       rotate_right(step);
//       steps_right -= step;
//     }
//   }
// }
