import serial
import time

def calculate_checksum(data: bytes) -> int:
    return sum(data) & 0xFF


packet = bytearray([
    0x54,  # Frame Header
    0x20,  # Function Mark
    0x00,  # mix: write
    0xFF,  # reserved
    0x00,  # id
    0xFF, 0xFF, 0xFF, 0xFF,  # system_time
	0b000_1_00_0_1, # mode: I2C
    0xFF, 0xFF,  # reserved
    0x00, 0x10, 0x0E,  # baudrate (921600) - leave as-is even for I2C
    0xFF,  # FOV.x
    0xFF,  # FOV.y
    0xFF,  # FOV.x_offset
    0xFF,  # FOV.y_offset
    0xFF, 0xFF,  # band_start
    0xFF, 0xFF,  # band_width
    *([0xFF] * 3),  # reserved
	0x00,			# reserved
    *([0xFF] * 4),  # reserved
])

# Add checksum
packet.append(calculate_checksum(packet))
print(len(packet))
print(' '.join(f'{b:02X}' for b in packet))

# Open serial at 921600 baud
ser = serial.Serial("/dev/ttyS0", baudrate=921600, timeout=1)

ser.write(packet)
