#pragma once
#include <Arduino.h>
#include <Stepper.h>
#include <Servo.h>

float map(float v, float sb, float se, float tb, float te) {
  return (v - sb) / (se - sb) * (te - tb) + tb;
}

int sign(int val) {
  if (val < 0) {
    return -1;
  }
  if (val > 0) {
    return 1;
  }
  return 0;
}

uint16_t read_uint16(uint8_t* buffer, int byte_offset) {
  uint16_t result = ((uint16_t)buffer[byte_offset + 1] << 8) | (uint16_t)buffer[byte_offset];
  return result;
}
int16_t read_int16(uint8_t* buffer, int byte_offset) {
  int16_t result = ((int16_t)buffer[byte_offset + 1] << 8) | (int16_t)buffer[byte_offset];
  return result;
}