from microbit import *
import music
import machine
import radio
radio.config(group=1, length=251, power=7, queue=20, channel=0)
radio.on()

def get_serial_number(type=hex):
    NRF_FICR_BASE = 0x10000000
    DEVICEID_INDEX = 25
    return type(machine.mem32[NRF_FICR_BASE + (DEVICEID_INDEX*4)]& 0xFFFFFFFF)

class cServo:
	def __init__(self, leftServoPin=pin1, compLServo=0.0, rightServoPin=pin2, compRServo=0.0):
		self.leftServo=leftServoPin
		self.rightServo=rightServoPin
		self.leftServo.set_analog_period(20)
		self.rightServo.set_analog_period(20)
		self._compL = compLServo
		self._compR = compRServo

	@property
	def compL(self):
		return self._compL
	
	@compL.setter
	def compL(self, upCompL):
		self._compL = upCompL

	@property
	def compR(self):
		return self._compR
	
	@compR.setter
	def compR(self, upCompR):
		self._compR = upCompR

	def set_ms_pulse(self, msLeft, msRight):
		self.leftServo.write_analog(1023 * msLeft / 20)
		self.rightServo.write_analog(1023 * msRight / 20)

	def stop(self):
		self.leftServo.write_analog(0)
		self.rightServo.write_analog(0)
		sleep(1000)

	def forward(self):
		global driveTime
		self.set_ms_pulse((2.0-self.compL), (1.0+self.compR))
		display.show(Image.ARROW_N)
		sleep(driveTime)
		self.stop()
		display.clear()

	def reverse(self):
		global driveTime
		self.set_ms_pulse((1.0+self.compL), (2.0-self.compR))
		display.show(Image.ARROW_S)
		sleep(driveTime)
		self.stop()
		display.clear()

	def leftTurn(self):
		global turnTime
		self.set_ms_pulse((1.0), (1.0))
		display.show(Image.ARROW_W)
		sleep(turnTime)
		self.stop()
		display.clear()

	def rightTurn(self):
		global turnTime
		self.set_ms_pulse((2.0), (2.0))
		display.show(Image.ARROW_E)
		sleep(turnTime)
		self.stop()
		display.clear()

#pi*axleTrack /4 = degree rotation -> timing next

#driveTime=1250
#turnTime=670

#logging
# log.set_labels('Session','Button','Program','LeftComp','RightComp','DriveTime','TurnTime','Language','Battery',timestamp=log.SECONDS)

#setting menu variables for calibration
menu = 0

#setting up variables from values in text files
with open('comp1.py', 'r') as comp1:
	pin1Comp = float(comp1.read())
with open('comp2.py', 'r') as comp2:
	pin2Comp = float(comp2.read())
with open('driveTime.py', 'r') as dtime:
	driveTime = int(dtime.read())
with open('turnTime.py', 'r') as ttime:
    turnTime = int(ttime.read())
with open('lang.py', 'r') as lang:
    language = int(lang.read())
with open('sound.py', 'r') as sound:
    soundLevel = int(sound.read())

#array to store directions when entered
recorded_button = []
i = 0
j = 0
#pin assignments not interacting with MB buttons, i2c, or LED array on V2
stopButton = pin9
playButton = pin5
forwardButton = pin13
reverseButton = pin14
leftButton = pin16
rightButton = pin15
enterButton = pin8
batPin = pin3

#pull up resistors on all pins
stopButton.set_pull(stopButton.PULL_UP)
playButton.set_pull(playButton.PULL_UP)
forwardButton.set_pull(forwardButton.PULL_UP)
reverseButton.set_pull(reverseButton.PULL_UP)
leftButton.set_pull(leftButton.PULL_UP)
rightButton.set_pull(rightButton.PULL_UP)
enterButton.set_pull(enterButton.PULL_UP)

#setting initial button states for comparison of pressing
buttonState1 = 0
lastState1 = 0
buttonState2 = 0
lastState2 = 0
buttonState3 = 0
lastState3 = 0
buttonState4 = 0
lastState4 = 0

debounceTime = 20

robot1 = cServo(compLServo=pin1Comp, compRServo=pin2Comp)

set_volume(soundLevel)
#measuring the battery voltage at an instance on pin 3 in a voltage divider configuration of 2x 100k resistors:
#take analog voltage w 2 decimals, multiply by two for voltage div, then multiply by source voltage 3.3, and divide by resolution of 1024 on ADC
#turning off the display allows pin 3 to be used as analog input

unique_id = str(get_serial_number())

def batteryLog():
	global measuredVBat
	global measuredVBatString
	display.off()
	measuredVBat = batPin.read_analog()
	display.on()
	measuredVBat = measuredVBat *2
	measuredVBat = measuredVBat *3.3
	measuredVBat = measuredVBat /1024
	measuredVBatString = '%.2f' % measuredVBat
	
	message = unique_id + " " + measuredVBatString
	
	max_retries = 2
	retry_count = 0
	
	while retry_count < max_retries:
		try:
			radio.send(message)
			sleep(5)
			break
		except:
			retry_count += 1
			sleep(25)

def sendButtonEvent(button_name, program=""):
	message = unique_id + " " + button_name
	if program:
		message += " " + program
	
	max_retries = 3
	retry_count = 0
	
	while retry_count < max_retries:
		try:
			radio.send(message)
			sleep(10)
			break
		except:
			retry_count += 1
			sleep(50)
			if retry_count >= max_retries:
				fallback_message = unique_id + " " + button_name
				radio.send(fallback_message)

#take initial battery mesaurement
batteryLog()
sleep(50)

#menu compare lists
compare_list = []

lastBatteryTime = running_time()

# log.add({'Session':"NEW",'LeftComp':pin1Comp,'RightComp':pin2Comp,'DriveTime':driveTime,'TurnTime':turnTime,'Language':language,'Battery':measuredVBatString})

while True:
#showing ready for a program and battery levels, normally a smile, asleep face when lower battery, skull when needs to be charged or only on USB
	
	# get battery levels every 5 seconds
	if running_time() - lastBatteryTime >= 5000:
		batteryLog()
		lastBatteryTime = running_time()
	
	if menu == 0 and measuredVBat >= 3.60:
		display.show(Image.HAPPY, wait=False)
		sleep(1)
	elif menu == 0 and measuredVBat < 3.30:
		display.show(Image.SAD, wait=False)
		sleep(1)
	elif menu == 0 and (measuredVBat >= 3.30 or measuredVBat < 3.60):
		display.show(Image.ASLEEP, wait=False)
		sleep(1)
# read direction button states
	robot1.compL=pin1Comp
	robot1.compR=pin2Comp
	sleep(50)
#!!!need to condense into for loop for scanning!!
	buttonState1 = forwardButton.read_digital()
	buttonState2 = reverseButton.read_digital()
	buttonState3 = leftButton.read_digital()
	buttonState4 = rightButton.read_digital()
# pressing red button clears the program and stops the robot
	if stopButton.read_digital() == 0 and menu == 0:
		if recorded_button != []:
			compareStrings = " ".join(compare_list)
			# log.add({"Button":"Clear",'Program':compareStrings})
			pass
		else:
			# log.add({"Button":"Clear",'Program':"Empty"})
			pass
		sleep(20)
		music.play(music.JUMP_DOWN, wait=False)
		robot1.stop()
		sleep(50)
		del recorded_button
		del compare_list
		recorded_button = []
		compare_list = []
		display.show(Image.TARGET)
		sleep(500)
		display.clear()
# pressing pins to record each movement
# !!!need to condense into IPO function!!!
	elif buttonState1 != lastState1:
		if buttonState1 == 0 and menu == 0:
			# log.add({"Button":"Forward"})
			recorded_button.append(robot1.forward)
			compare_list.append("forward")
			music.play(music.BA_DING, wait=False)
		sleep(debounceTime)
		lastState1 = buttonState1
	elif buttonState2 != lastState2:
		if buttonState2 == 0 and menu == 0:
			# log.add({"Button":"Reverse"})
			recorded_button.append(robot1.reverse)
			compare_list.append("reverse")
			music.play(music.BA_DING, wait=False)
		sleep(debounceTime)
		lastState2 = buttonState2
	elif buttonState3 != lastState3:
		if buttonState3 == 0 and menu == 0:
			# log.add({"Button":"Left"})
			recorded_button.append(robot1.leftTurn)
			compare_list.append("left")
			music.play(music.BA_DING, wait=False)
		sleep(debounceTime)
		lastState3 = buttonState3
	elif buttonState4 != lastState4:
		if buttonState4 == 0 and menu == 0:
			# log.add({"Button":"Right"})
			recorded_button.append(robot1.rightTurn)
			compare_list.append("right")
			music.play(music.BA_DING, wait=False)
		sleep(debounceTime)
		lastState4 = buttonState4
# start the recorded program
	elif playButton.read_digital() == 0 and menu == 0:
		sleep(20)
		batteryLog()
		music.play(music.JUMP_UP, wait=False)
		if recorded_button != []:
			compareStrings = " ".join(compare_list)
			# log.add({'Button':"Play", 'Program':compareStrings})
			sendButtonEvent("PLAY", compareStrings)
			if language==1:
				display.scroll("Go")
			elif language==2:
				display.scroll("Ir")
			for i in range(len(recorded_button)):
				audio.play(Sound.SPRING, wait=False)
				recorded_button[i]()
				if recorded_button == []:
					break
			del recorded_button
			del compare_list
			recorded_button = []
			compare_list = []
			sleep(20)
			display.clear()
		else:
			# log.add({"Button":"Play", 'Program':"Empty"})
			sendButtonEvent("PLAY", "")
			display.show(Image.SQUARE)
			sleep(500)
			display.clear()

# play back the current recorded program for student testing
	elif enterButton.read_digital() == 0 and menu == 0:
		sleep(20)
		music.play(music.BA_DING, wait=False)
		sleep(50)
		if compare_list != []:
			compareStrings = " ".join(compare_list)
			# log.add({'Button':"Test", 'Program':compareStrings})
			sendButtonEvent("TEST", compareStrings)
			if language==1:
				display.scroll("Test", delay=75)
			elif language==2:
				display.scroll("Probar", delay=75)
			sleep(500)
			for j in range(len(compare_list)):
				if compare_list[j] == "forward":
					display.show(Image.ARROW_N)
					sleep(1000)
					display.clear()
				elif compare_list[j] == "reverse":
					display.show(Image.ARROW_S)
					sleep(1000)
					display.clear()
				elif compare_list[j] == "right":
					display.show(Image.ARROW_E)
					sleep(1000)
					display.clear()
				elif compare_list[j] == "left":
					display.show(Image.ARROW_W)
					sleep(1000)
					display.clear()
				sleep(50)
				if compare_list == []:
					break
			sleep(20)
			display.clear()
		else:
			# log.add({"Button":"Test", 'Program':"Empty"})
			sendButtonEvent("TEST", "")
			display.show(Image.SQUARE)
			sleep(500)
			display.clear()

#save current values and store them, exit menu
	if playButton.read_digital() == 0 and menu != 0:
		display.clear()
		sleep(50)
		music.play(music.BA_DING, wait=False)
		batteryLog()
		# log.add({'Button':"Store",'LeftComp':pin1Comp,'RightComp':pin2Comp,'DriveTime':driveTime,'TurnTime':turnTime,'Language':language,'Battery':measuredVBatString})
		with open('comp1.py', 'w') as comp1:
			comp1.write(str(pin1Comp))
		with open('comp2.py', 'w') as comp2:
			comp2.write(str(pin2Comp))
		with open('driveTime.py', 'w') as dtime:
			dtime.write(str(driveTime))
		with open('turnTime.py', 'w') as ttime:
			ttime.write(str(turnTime))
		with open('lang.py', 'w') as lang:
			lang.write(str(language))
		with open('sound.py', 'w') as sound:
			sound.write(str(soundLevel))
		recorded_button = []
		compare_list = []
		menu = 0
		display.show(Image.YES)
		sleep(1000)
		display.clear()

# reset all values to defaults and store them, exit menu
	if stopButton.read_digital() == 0 and menu != 0:
		display.clear()
		sleep(50)
		music.play(music.BA_DING, wait=False)
		pin1Comp = 0.0
		pin2Comp = 0.0
		driveTime = 1250
		turnTime = 670
		language = 1
		soundLevel = 102
		batteryLog()
		# log.add({"Button":"Reset",'LeftComp':pin1Comp,'RightComp':pin2Comp,'DriveTime':driveTime,'TurnTime':turnTime,'Language':language,'Battery':measuredVBatString})
		with open('comp1.py', 'w') as comp1:
			comp1.write(str(pin1Comp))
		with open('comp2.py', 'w') as comp2:
			comp2.write(str(pin2Comp))
		with open('driveTime.py', 'w') as dtime:
			dtime.write(str(driveTime))
		with open('turnTime.py', 'w') as ttime:
			ttime.write(str(turnTime))
		with open('lang.py', 'w') as lang:
			lang.write(str(language))
		with open('sound.py', 'w') as sound:
			sound.write(str(soundLevel))
		recorded_button = []
		compare_list = []
		menu = 0
		set_volume(soundLevel)
		display.show(Image.TARGET)
		sleep(1000)

#menu system thru enter button
	while pin_logo.is_touched()==True:
		if enterButton.read_digital() == 0 and menu == 0:
			sleep(20)
			music.play(music.BA_DING, wait=False)
			# log.add({"Button":"Langauge"})
			robot1.stop()
			display.show(Image.STICKFIGURE)
			sleep(50)
			menu = 1
		if playButton.read_digital() == 0 and menu == 0:
			sleep(20)
			# Send button event for logo-touched PLAY
			if recorded_button != []:
				compareStrings = " ".join(compare_list)
				sendButtonEvent("PLAY", compareStrings)
			else:
				sendButtonEvent("PLAY", "")
			
			music.play(music.PYTHON,wait=False,loop=True)
			display.show(Image.ARROW_S)
			sleep(500)
			display.clear()
			sleep(500)			
			display.show(Image.ARROW_S)
			sleep(500)
			display.clear()
			sleep(500)	
			display.show(Image.ARROW_S)
			sleep(500)
			display.clear()
			sleep(500)	
			display.show(Image.ARROW_S)
			sleep(500)
			display.show(Image('00900:' '00000:' '00900:' '00900:' '00900'))
			robot1.set_ms_pulse(1.0, 2.0)
			sleep(20000)
			robot1.set_ms_pulse(2.0, 1.0)
			sleep(20000)
			robot1.set_ms_pulse(1.0, 1.0)
			sleep(20000)
			robot1.set_ms_pulse(2.0, 2.0)
			sleep(20000)
			music.stop()
			robot1.stop()
	if enterButton.read_digital() == 0 and menu == 6:
		sleep(20)
		# log.add({"Button":"Langauge"})
		robot1.stop()
		display.show(Image.STICKFIGURE)
		sleep(50)
		menu = 1
	if enterButton.read_digital() == 0 and menu == 1:
		# log.add({"Button":"MotorCal"})
		robot1.stop()
		display.show("M")
		sleep(50)
		menu = 2
	if enterButton.read_digital() == 0 and menu == 2:
		# log.add({"Button":"DistanceCal"})
		robot1.stop()
		display.show("D")
		sleep(50)
		menu = 3
	if enterButton.read_digital() == 0 and menu == 3:
		# log.add({"Button":"TurningCal"})
		robot1.stop()
		display.show("T")
		sleep(50)
		menu = 4
	if enterButton.read_digital() == 0 and menu == 4:
		# log.add({"Button":"Volume"})
		robot1.stop()
		display.show(Image.MUSIC_QUAVERS)
		sleep(50)
		menu = 5
	if enterButton.read_digital() == 0 and menu == 5:
		# log.add({"Button":"DataLog"})
		robot1.stop()
		display.show(Image("99900:90090:90009:90009:99999"))
		sleep(50)
		menu = 6

#calibration menu #6 for data
	if forwardButton.read_digital() == 0 and menu == 6:
		# log.delete(full=True)
		# log.set_labels('Session','Button','Program','LeftComp','RightComp','DriveTime','TurnTime','Language','Battery',timestamp=log.SECONDS)
		batteryLog()
		# log.add({'Session':"CLRDATA",'LeftComp':pin1Comp,'RightComp':pin2Comp,'DriveTime':driveTime,'TurnTime':turnTime,'Language':language,'Battery':measuredVBatString})
		display.show(Image("99900:90090:90009:90009:99999"))
		sleep(300)
		display.show(Image.NO)
		sleep(300)
		display.show(Image("99900:90090:90009:90009:99999"))
		sleep(300)
		display.show(Image.NO)
		sleep(50)

#calibration menu #5 for sound level
	if forwardButton.read_digital() == 0 and menu == 5:
		if soundLevel < 255:
			soundLevel = soundLevel + 51
			set_volume(soundLevel)
			music.play(music.BA_DING, wait=False)
			display.show(Image.ARROW_N, delay=75, wait=False, loop=True)
			sleep(50)
		else:
			if language==1:
				display.scroll("Max", delay=75, wait=False, loop=True)
			elif language==2:
				display.scroll("Max", delay=75, wait=False, loop=True)
	if reverseButton.read_digital() == 0 and menu == 5:
		if soundLevel > 0:
			soundLevel = soundLevel - 51
			set_volume(soundLevel)
			music.play(music.BA_DING, wait=False)
			display.show(Image.ARROW_S, delay=75, wait=False, loop=True)
			sleep(50)
		else:
			if language==1:
				display.scroll("Mute", delay=75, wait=False, loop=True)
			elif language==2:
				display.scroll("Mudo", delay=75, wait=False, loop=True)

#calibration menu #1 for language
	if forwardButton.read_digital() == 0 and menu == 1:
		display.scroll("ENG", delay = 75, wait=False, loop=True)
		language = 1
		sleep(50)
	if reverseButton.read_digital() == 0 and menu == 1:
		display.scroll("ESP", delay = 75, wait=False, loop=True)
		language = 2
		sleep(50)

#calibration menu #4 turning time
	if forwardButton.read_digital() == 0 and menu == 4:
		turnTime=turnTime+10
		display.scroll(turnTime, delay=75, wait=False, loop=True)
		sleep(50)
	if reverseButton.read_digital() == 0 and menu == 4:
		if turnTime > 9:
			turnTime=turnTime-10
			display.scroll(turnTime, delay=75, wait=False, loop=True)
			sleep(50)
		else:
			display.show("0")

#calibration menu #3 distance set time
	if forwardButton.read_digital() == 0 and menu == 3:
		driveTime=driveTime+50
		display.scroll(driveTime, delay=75, wait=False, loop=True)
		sleep(50)
	if reverseButton.read_digital() == 0 and menu == 3:
		if driveTime > 49:
			driveTime=driveTime-50
			display.scroll(driveTime, delay=75, wait=False, loop=True)
			sleep(50)
		else:
			display.show("0")

#calibration menu #2 left right servo balance compensation
	if rightButton.read_digital() == 0 and menu == 2:
		if pin2Comp < .5:
			pin2Comp=pin2Comp+.01
			comp2Display=int(100-(pin2Comp*200))
			display.scroll("%s%%"%comp2Display, delay=75, wait=False, loop=True)
			sleep(50)
		else:
			if language==1:
				display.scroll("Max", delay=75, wait=False, loop=True)
			elif language==2:
				display.scroll("Max", delay=75, wait=False, loop=True)
	if leftButton.read_digital() == 0 and menu == 2:
		if pin1Comp < .5:
			pin1Comp=pin1Comp+.01
			comp1Display=int(100-(pin1Comp*200))
			display.scroll("%s%%"%comp1Display, wait=False, delay=75)
			sleep(50)
		else:
			if language==1:
				display.scroll("Max", delay=75, wait=False, loop=True)
			elif language==2:
				display.scroll("Max", delay=75, wait=False, loop=True)
