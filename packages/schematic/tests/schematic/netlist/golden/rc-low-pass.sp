* analog-tools structural netlist
.subckt schematic GND
  VIN net0 GND DC 1
  R1 net0 net1 10k
  C1 net1 GND 100p
.ends schematic
