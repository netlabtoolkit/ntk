import time
import board
import pwmio

# Initialize PWM on pin A3 with a variable frequency for playing tones
buzzer = pwmio.PWMOut(board.A3, duty_cycle=0, frequency=440, variable_frequency=True)

# Define a sequence of notes (frequencies in Hz) representing C4, D4, E4, F4, G4
notes = [262, 294, 330, 349, 392]
note_duration = 0.25  # Duration of each note in seconds
rest_duration = 0.05  # Short pause between notes

print("Playing melody using built-in pwmio...")

try:
    while True:
        for frequency in notes:
            if frequency > 0:
                buzzer.frequency = frequency
                buzzer.duty_cycle = 32768  # 50% duty cycle (half of 65535) for sound
            else:
                buzzer.duty_cycle = 0  # Rest / silence
                
            time.sleep(note_duration)
            
            # Turn off buzzer briefly between notes for clear separation
            buzzer.duty_cycle = 0
            time.sleep(rest_duration)
        
        # Wait a bit longer before repeating the sequence
        time.sleep(1.5)
finally:
    # Ensure the buzzer turns off and releases the pin if the program stops
    buzzer.deinit()