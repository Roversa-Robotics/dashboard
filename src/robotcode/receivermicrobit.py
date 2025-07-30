from microbit import *
import radio

radio.config(group=1, length=251, power=7, queue=20, channel=0)
radio.on()

while True:
    incoming = radio.receive()

    if incoming:
        try:
            incoming = incoming.strip()
            parts = incoming.split(" ")
            
            if len(parts) >= 2:
                device_id = parts[0]
                
                if len(parts) == 2 and parts[1].replace('.', '').isdigit():
                    battery_level = parts[1]
                    print(device_id + " " + battery_level)
                
                elif len(parts) >= 2 and parts[1] in ["PLAY", "TEST"]:
                    button_name = parts[1]
                    program = " ".join(parts[2:]) if len(parts) > 2 else ""
                    print(device_id + " " + button_name + " " + program)
                
                else:
                    print(incoming)
        except Exception as e:
            print(incoming)

    sleep(50)