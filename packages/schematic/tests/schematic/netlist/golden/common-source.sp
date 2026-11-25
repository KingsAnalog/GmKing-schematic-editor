* analog-tools structural netlist
.subckt schematic VDD GND
  VIN net0 GND DC 0.7
  R1 VDD net1 10k
  XM1 net1 net0 GND GND sky130_fd_pr__nfet_01v8 w=2u l=0.15u m=2 nf=4
.ends schematic
