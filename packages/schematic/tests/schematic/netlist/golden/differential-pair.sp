* analog-tools structural netlist
.subckt schematic VDD GND
  VIP net0 GND DC 0.71
  VIN net1 GND DC 0.69
  R1 VDD net2 10k
  R2 VDD net3 10k
  XM1 net2 net0 net4 GND sky130_fd_pr__nfet_01v8 w=2u l=0.15u m=2 nf=4
  XM2 net3 net1 net4 GND sky130_fd_pr__nfet_01v8 w=2u l=0.15u m=2 nf=4
  I1 net4 GND DC 100u
.ends schematic
