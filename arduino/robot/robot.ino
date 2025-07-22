#include "TOF_Reader.h"
#include "motors.h"
#include "helper.h"

const int ledPin = 13;  // the number of the bulit-in LED pin
int count = 0;

void read_serial_input();
void print_TOF_to_serial(TOF_Parameter tof);

void setup() {
  Serial.begin(9600);
  pinMode(ledPin, OUTPUT);
  init_motors();

  Wire.begin();  //Initialize Hardware I2C 初始化硬件I2C
  Wire.setClock(400000);

  test_sequence();
}

void test_sequence() {
  delay(500);
  set_sensor_direction(-1);
  set_sensor_direction(1);
  set_sensor_direction(0);
  // delay(1000);
  // scan(0, 100);
  // drive_command(0, 500, 1000);
  // drive_command(1, 1000, 500);
  // drive_command(1, -1000, -500);
  // drive_command(1, -500, -1000);
  // set_sensor_direction(0);
  // set_sensor_direction(-1);
  // set_sensor_direction(1);
  // set_sensor_direction(0);
}

void loop() {
  // Serial.print("log:loop ");
  // Serial.println(count, DEC);

  // int read = Serial.read();
  // if (read >= 0) {
  //   Serial.print("log:read ");
  //   Serial.println((char)read);
  // }

  // TOF_Active_Decoding();
  // TOF_Parameter data = Get_TOF();
  // print_TOF_to_serial(data);

  read_serial_input();

  count++;
  delay(200);
}

const byte msg_start[] = { 0, 13, 10 };
int start_index = 0;

void read_serial_input() {
  if (!Serial.available()) {
    return;
  }
  while (Serial.available() && start_index < 3) {
    int data = Serial.read();
    if (data != msg_start[start_index]) {
      start_index = 0;
    }
    if (data == msg_start[start_index]) {
      start_index++;
    }
  }

  if (!Serial.available()) {
    return;
  }

  if (start_index == 3) {
    start_index = 0;

    // read message
    int length = Serial.read();
    if (length < 3) {
      Serial.println("log did not receive message");
      return;
    }
    byte* data = malloc(length);
    int received_length = Serial.readBytes(data, length);
    if (received_length == length) {
      // received complete message
      // Serial.print("log received");
      // for (int i = 0; i < length; i++) {
      //   Serial.print(" ");
      //   Serial.print(data[i], HEX);
      // }
      // Serial.println();

      uint16_t id = read_uint16(data, 0);
      int command = data[2];
      Serial.print("log id ");
      Serial.print(id, DEC);
      Serial.print(" command ");
      Serial.print(command, DEC);
      Serial.println();

      if (command == 1) {
        // drive
        if (length < 5) {
          return;
        }
        int left_steps = read_int16(data, 4);
        int right_steps = read_int16(data, 6);
        drive_command(id, left_steps, right_steps);
      } else if (command == 5) {
        // scan
        int count = data[3];
        scan(id, count);
      } else {
        // unknown
        Serial.print("err unknown command ");
        Serial.println(command, DEC);
      }

      Serial.print("data ");
      Serial.print(id, DEC);
      Serial.println(":$");
    }
    delete data;
  }
}

void drive_command(uint16_t id, int left_steps, int right_steps) {
  float ratio = (float)abs(left_steps) / (float)(abs(left_steps) + abs(right_steps));

  int max_steps_at_once = 10;

  while (left_steps != 0 || right_steps != 0) {
    if (left_steps == 0) {
      rotate_right(right_steps);
      break;
    }
    if (right_steps == 0) {
      rotate_left(left_steps);
      break;
    }
    float curr_ratio = (float)abs(left_steps) / (float)(abs(left_steps) + abs(right_steps));
    if (curr_ratio > ratio) {
      // move left
      int count = min(abs(left_steps), max_steps_at_once);
      int step = sign(left_steps) * count;
      rotate_left(step);
      left_steps -= step;
    } else {
      // move right
      int count = min(abs(right_steps), max_steps_at_once);
      int step = sign(right_steps) * count;
      rotate_right(step);
      right_steps -= step;
    }
  }
}

void scan(uint16_t id, uint16_t count) {
  for (int i = 0; i < count; i++) {
    float direction = -((float)i / (float)(count - 1)) * 2.0 + 1.0;
    set_sensor_direction(direction);
    TOF_Parameter data = Get_TOF();
    Serial.print("data ");
    Serial.print(id, DEC);
    Serial.print(":");
    Serial.print(i, DEC);
    Serial.print(",");
    Serial.print(data.dis_status, DEC);
    Serial.print(",");
    Serial.print(data.dis, DEC);
    Serial.println();
  }
  set_sensor_direction(0);
}

void print_TOF_to_serial(TOF_Parameter tof) {
  Serial.print("tof:");
  Serial.print(tof.id, DEC);
  Serial.print(",");
  Serial.print(tof.dis_status, DEC);
  Serial.print(",");
  Serial.print(tof.dis, DEC);
  Serial.print(",");
  Serial.print(tof.signal_strength, DEC);
  Serial.print(",");
  Serial.print(tof.system_time, DEC);
  Serial.print(",");
  Serial.println(tof.range_precision, DEC);
}
