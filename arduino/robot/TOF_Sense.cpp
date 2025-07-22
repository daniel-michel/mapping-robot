/*****************************************************************************
 * | File      	:   TOF_Sense.c
 * | Author      :   Waveshare team
 * | Function    :   TOF drive function
 * | Info        :
 *----------------
 * |	This version:   V1.0
 * | Date        :   2024-09-11
 * | Info        :   Basic version
 *
 ******************************************************************************/
#include "TOF_Sense.h"

TOF_Parameter TOF_0; // Define a structure to store decoded data 定义一个存放解码后数据的结构体

void I2C_Read_Nbyte(uint8_t Cmd,uint8_t *pdata,uint8_t len){
  uint8_t num = 0;
  Wire.beginTransmission(ADDR_SLAVE); //Set the slave address and start I2C communication 设置从机地址，并开始I2C通信
  Wire.write(Cmd);                    //Write register 写入寄存器
  Wire.endTransmission();//Stop I2C communication 停止I2C通信
  
  Wire.requestFrom((uint8_t)ADDR_SLAVE,len);   //Specify the corresponding number of slaves to read 指定从机读取对应数量
  while(len--)
  {
    pdata[num++] = Wire.read();//Reading Data 读取数据
  }
  Wire.endTransmission();//Stop I2C communication 停止I2C通信
}
/******************************************************************************
function:	Get TOF data through I2C query and decode it 通过I2C查询的方式获取TOF数据，并进行解码
parameter:
Info:
******************************************************************************/
void TOF_Inquire_I2C_Decoding()
{
    uint8_t read_buf[256];

    //UNO R3 cannot read all the data at once, so it reads the data twice. UNO R3无法一次性读取全部数据，所以这里读两次数据
    I2C_Read_Nbyte(0x00, read_buf, TOF_REGISTER_TOTAL_SIZE/2); // Read half of the sensor data 读取传感器一半数据
    I2C_Read_Nbyte(TOF_REGISTER_TOTAL_SIZE/2, &read_buf[TOF_REGISTER_TOTAL_SIZE/2], TOF_REGISTER_TOTAL_SIZE/2); // Read the other half of the sensor data 读取传感器另一半数据

    TOF_0.interface_mode = read_buf[TOF_ADDR_MODE] & 0x07; // Working mode of TOF module TOF 模块的工作模式

    TOF_0.id = read_buf[TOF_ADDR_ID]; // ID of the TOF module TOF 模块的 ID

    TOF_0.uart_baudrate = (unsigned long)(((unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE + 3] << 24) | ((unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE + 2] << 16) | // TOF module serial port baud rate TOF 模块的串口波特率
                           ((unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE + 1] << 8) | (unsigned long)read_buf[TOF_ADDR_UART_BAUDRATE]);

    TOF_0.system_time = (unsigned long)(((unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME + 3] << 24) | ((unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME + 2] << 16) | // The time after the TOF module is powered on TOF模块上电后经过的时间
                         ((unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME + 1] << 8) | (unsigned long)read_buf[TOF_ADDR_SYSTEM_TIME]);

    TOF_0.dis = (unsigned long)(((unsigned long)read_buf[TOF_ADDR_DIS + 3] << 24) | ((unsigned long)read_buf[TOF_ADDR_DIS + 2] << 16) | // The distance output by the TOF module TOF模块输出的距离
                 ((unsigned long)read_buf[TOF_ADDR_DIS + 1] << 8) | (unsigned long)read_buf[TOF_ADDR_DIS]);

    TOF_0.dis_status = ((read_buf[TOF_ADDR_DIS_STATUS]) | (read_buf[TOF_ADDR_DIS_STATUS + 1] << 8)); // Distance status indication output by TOF module TOF模块输出的距离状态指示

    TOF_0.signal_strength = ((read_buf[TOF_ADDR_SIGNAL_STRENGTH]) | (read_buf[TOF_ADDR_SIGNAL_STRENGTH + 1] << 8)); // The signal strength output by the TOF module TOF模块输出的信号强度
    TOF_0.range_precision = read_buf[TOF_ADDR_RANGE_PRECISION];                                                     // The repeatability accuracy reference value output by the TOF module is invalid for Type C, Type D and Mini. TOF模块输出的重复测距精度参考值，对于C型,D型和Mini型是无效的

    //Print data through the terminal 通过终端打印数据
    Serial.print("TOF id is:");             Serial.println(TOF_0.id);
    Serial.print("TOF system time is:");    Serial.println(TOF_0.system_time);
    Serial.print("TOF distance is:");       Serial.println(TOF_0.dis);
    Serial.print("TOF status is:");         Serial.println(TOF_0.dis_status);
    Serial.print("TOF signal strength is:");Serial.println(TOF_0.signal_strength);
    Serial.print("TOF range precision is:");Serial.println(TOF_0.range_precision);
    
    if (TOF_0.interface_mode == 0) // communication interface mode,0-UART，1-CAN，2-I/O，3-IIC 通讯接口模式,0-UART，1-CAN，2-I/O，3-IIC
        Serial.println("UART Mode.");
    else if (TOF_0.interface_mode == 1)
    {
        Serial.println("CAN Mode.");
    }
    else if (TOF_0.interface_mode == 2)
    {
        Serial.println("I/O Mode.");
    }
    else
        Serial.println("I2C Mode.");

    Serial.print("TOF uart baudrate is:");   Serial.println(TOF_0.uart_baudrate);
    Serial.println();
}

/************************************************
function name : IIC_Change_Mode_To_UART
function function : Change the communication mode to UART mode through IIC
parameters:
return value : Whether the mark operation is correct or not, 0 is wrong, 1 is correct
*************************************************/
void IIC_Change_Mode_To_UART()
{
    // I2C_Write_Byte(TOF_ADDR_MODE, IIC_CHANGE_TO_UART_DATA);
    Wire.beginTransmission(ADDR_SLAVE);
    Wire.write(TOF_ADDR_MODE);//Write register 写入寄存器
    Wire.write(IIC_CHANGE_TO_UART_DATA);//Writing Data 写入数据
    Wire.endTransmission();
    Serial.println("Modification successful.");
}
