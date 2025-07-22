#pragma once
#include "TOF_Sense.h"

TOF_Parameter Get_TOF() {
  TOF_Parameter result{};

  uint8_t read_buf[256];

  //UNO R3 cannot read all the data at once, so it reads the data twice. UNO R3无法一次性读取全部数据，所以这里读两次数据
  I2C_Read_Nbyte(0x00, read_buf, TOF_REGISTER_TOTAL_SIZE / 2);                                                       // Read half of the sensor data 读取传感器一半数据
  I2C_Read_Nbyte(TOF_REGISTER_TOTAL_SIZE / 2, &read_buf[TOF_REGISTER_TOTAL_SIZE / 2], TOF_REGISTER_TOTAL_SIZE / 2);  // Read the other half of the sensor data 读取传感器另一半数据

  result.interface_mode = read_buf[TOF_ADDR_MODE] & 0x07;  // Working mode of TOF module TOF 模块的工作模式

  result.id = read_buf[TOF_ADDR_ID];  // ID of the TOF module TOF 模块的 ID

  result.uart_baudrate = (unsigned long)(((unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE + 3] << 24) | ((unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE + 2] << 16) |  // TOF module serial port baud rate TOF 模块的串口波特率
                                         ((unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE + 1] << 8) | (unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE]);

  result.system_time = (unsigned long)(((unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME + 3] << 24) | ((unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME + 2] << 16) |  // The time after the TOF module is powered on TOF模块上电后经过的时间
                                       ((unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME + 1] << 8) | (unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME]);

  result.dis = (unsigned long)(((unsigned long)read_buf[TOF_ADDR_DIS + 3] << 24) | ((unsigned long)read_buf[TOF_ADDR_DIS + 2] << 16) |  // The distance output by the TOF module TOF模块输出的距离
                               ((unsigned long)read_buf[TOF_ADDR_DIS + 1] << 8) | (unsigned long)read_buf[TOF_ADDR_DIS]);

  result.dis_status = ((read_buf[TOF_ADDR_DIS_STATUS]) | (read_buf[TOF_ADDR_DIS_STATUS + 1] << 8));  // Distance status indication output by TOF module TOF模块输出的距离状态指示

  result.signal_strength = ((read_buf[TOF_ADDR_SIGNAL_STRENGTH]) | (read_buf[TOF_ADDR_SIGNAL_STRENGTH + 1] << 8));  // The signal strength output by the TOF module TOF模块输出的信号强度
  result.range_precision = read_buf[TOF_ADDR_RANGE_PRECISION];

  return result;
}