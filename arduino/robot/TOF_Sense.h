#ifndef _TOF_SENSE_H_
#define _TOF_SENSE_H_

#include "Arduino.h"
#include "Wire.h"

typedef struct {
  uint8_t id;//TOF模块的id
  uint32_t system_time;//TOF模块上电后经过的时间，单位：ms
  uint32_t dis;//TOF模块输出的距离，单位：m
  uint8_t dis_status;//TOF模块输出的距离状态指示
  uint16_t signal_strength;//TOF模块输出的信号强度
  uint8_t range_precision;//TOF模块输出的重复测距精度参考值，TOFSense-F系列有效，单位：cm
  uint8_t interface_mode;//communication interface mode,0-UART，1-CAN，2-I/O，3-IIC 通讯接口模式,0-UART，1-CAN，2-I/O，3-IIC
	uint32_t uart_baudrate;//UART baud rate 串口波特率
} TOF_Parameter;//解码后的TOF数据结构体

#define ADDR_SLAVE 0x08//7-bit slave address=ID+0x08 ID=0
#define ADDR_SLAVE1 0x09//7-bit slave address=ID+0x08 ID=1

//Register variable size address list (commonly used)
#define TOF_REGISTER_TOTAL_SIZE 48//Total length of all registers

#define TOF_ADDR_MODE 0x0c//pattern variable address
#define TOF_SIZE_MODE 1//The number of bytes occupied by the pattern variable

#define TOF_ADDR_ID 0x0d//ID variable address
#define TOF_SIZE_ID 1//The number of bytes occupied by the ID variable

#define TOF_ADDR_UART_BAUDRATE 0x10//UART baud rate variable address
#define TOF_SIZE_UART_BAUDRATE 4//The number of bytes occupied by the UART baud rate variable

#define TOF_ADDR_SYSTEM_TIME 0x20//System time variable address
#define TOF_SIZE_SYSTEM_TIME 4//The number of bytes occupied by the system time variable

#define TOF_ADDR_DIS 0x24//distance variable address
#define TOF_SIZE_DIS 4//The number of bytes occupied by the distance variable

#define TOF_ADDR_DIS_STATUS 0x28//Distance status indication variable address
#define TOF_SIZE_DIS_STATUS 2//The number of bytes occupied by the distance status indicator variable

#define TOF_ADDR_SIGNAL_STRENGTH 0x2a//Signal strength variable address
#define TOF_SIZE_SIGNAL_STRENGTH 2//The number of bytes occupied by the signal strength variable

#define TOF_ADDR_RANGE_PRECISION 0x2c//Ranging accuracy variable address
#define TOF_SIZE_RANGE_PRECISION 1//The number of bytes occupied by the ranging precision variable

#define IIC_CHANGE_TO_UART_DATA 0x00//Change the communication mode to the byte data that needs to be sent by UART


void TOF_Inquire_I2C_Decoding();
void IIC_Change_Mode_To_UART();
void I2C_Read_Nbyte(uint8_t Cmd, uint8_t *pdata, uint8_t len);


#endif