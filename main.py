import os
import random
import sys
import time

Map Symbols
WALL = "#"
FLOOR = "."
PLAYER = "@"
ENEMY = "E"
DATA_CHIP = "*"
EXIT = "X"

WIDTH = 20
HEIGHT = 10

class CyberCrawler:

def init(self):
self.player_hp = 100
self.score = 0
self.level = 1
self.player_pos = [1, 1]
self.exit_pos = [HEIGHT - 2, WIDTH - 2]
self.enemies = []
self.chips = []
self.grid = []
self.game_over = False
self.message = "Welcome to CyberCrawler. Reach the exit [X]!"

self.generate_level()

def generate_level(self):
# Create empty grid with border walls
self.grid = []
for r in range(HEIGHT):
row = []
for c in range(WIDTH):
if r == 0 or r == HEIGHT - 1 or c == 0 or c == WIDTH - 1:
row.append(WALL)
else:
row.append(FLOOR)
self.grid.append(row)

# Spawn Player & Exit
self.player_pos = [1, 1]
self.grid[1][1] = PLAYER
self.grid[self.exit_pos[0]][self.exit_pos[1]] = EXIT

# Spawn Data Chips (*)
self.chips = []
for _ in range(3 + self.level):
r = random.randint(1, HEIGHT - 2)
c = random.randint(1, WIDTH - 2)
if (r, c) not in [(1, 1), tuple(self.exit_pos)]:
self.chips.append([r, c])
self.grid[r][c] = DATA_CHIP

# Spawn Enemies (E)
self.enemies = []
for _ in range(2 + self.level):
r = random.randint(2, HEIGHT - 2)
c = random.randint(2, WIDTH - 2)
if (r, c) not in [(1, 1), tuple(self.exit_pos)]:
self.enemies.append([r, c])
self.grid[r][c] = ENEMY

def render(self):
# Clear screen for ANSI-compatible terminal
os.system("cls" if os.name == "nt" else "clear")

print("=" * (WIDTH * 2))
print(f" CYBER CRAWLER | Level: {self.level} | HP: {self.player_hp} | Score: {self.score}")
print("=" * (WIDTH * 2))

# Re-draw Dynamic Entities onto Grid
temp_grid = [row[:] for row in self.grid]
for r, c in self.chips:
temp_grid[r][c] = DATA_CHIP
for r, c in self.enemies:
temp_grid[r][c] = ENEMY
temp_grid[self.player_pos[0]][self.player_pos[1]] = PLAYER

for row in temp_grid:
print(" ".join(row))

print("=" * (WIDTH * 2))
print(f" Log: {self.message}")
print(" Controls: W (Up), A (Left), S (Down), D (Right), Q (Quit)")

def move_player(self, dr, dc):
new_r = self.player_pos[0] + dr
new_c = self.player_pos[1] + dc

# Check Wall Collision
if self.grid[new_r][new_c] == WALL:
self.message = "Hit a firewall! Movement blocked."
return

self.player_pos = [new_r, new_c]

# Collect Data Chips
if [new_r, new_c] in self.chips:
self.chips.remove([new_r, new_c])
self.score += 50
self.message = "Data Chip acquired! (+50 pts)"

# Reach Exit
if self.player_pos == self.exit_pos:
self.level += 1
self.score += 100
self.message = f"Decrypted security portal! Advancing to Level {self.level}."
self.generate_level()
return

# Move Enemies after Player
self.update_enemies()

def update_enemies(self):
for enemy in self.enemies:
# Simple AI: Move toward player
er, ec = enemy
pr, pc = self.player_pos

dr = 1 if pr > er else (-1 if pr < er else 0)
dc = 1 if pc > ec else (-1 if pc < ec else 0)

# Pick one direction to move
if dr != 0 and random.choice([True, False]):
new_er, new_ec = er + dr, ec
elif dc != 0:
new_er, new_ec = er, ec + dc
else:
new_er, new_ec = er, ec

# Enemy Attacks Player
if [new_er, new_ec] == self.player_pos:
damage = random.randint(10, 20)
self.player_hp -= damage
self.message = f"Alert! Enemy virus ambushed you (-{damage} HP)!"
if self.player_hp <= 0:
self.game_over = True
elif self.grid[new_er][new_ec] != WALL:
enemy[0], enemy[1] = new_er, new_ec

def main():
game = CyberCrawler()

while not game.game_over:
game.render()
move = input("\nAction > ").strip().lower()

if move == "w":
game.move_player(-1, 0)
elif move == "s":
game.move_player(1, 0)
elif move == "a":
game.move_player(0, -1)
elif move == "d":
game.move_player(0, 1)
elif move == "q":
print("System disconnected.")
break
else:
game.message = "Invalid key press. Use W, A, S, D."

if game.game_over:
game.render()
print("\n SYSTEM CRASHED: HP reached 0. Game Over!")

if name == "main":
main()
