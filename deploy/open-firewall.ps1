<#
  เปิดพอร์ตบน Windows Firewall ให้คนภายนอกเข้าถึง Donate Overlay ได้
  รันใน PowerShell แบบ "Run as Administrator"

      .\deploy\open-firewall.ps1            # เปิดพอร์ต 3000 (ค่าเริ่มต้น)
      .\deploy\open-firewall.ps1 -Port 80   # เปิดพอร์ตอื่น
#>
param([int]$Port = 3000)

$name = "Donate Overlay (TCP $Port)"

# ใช้ netsh เพื่อความเข้ากันได้กับ Windows Server 2012
netsh advfirewall firewall delete rule name="$name" 2>$null | Out-Null
netsh advfirewall firewall add rule name="$name" dir=in action=allow protocol=TCP localport=$Port

if ($LASTEXITCODE -eq 0) {
  Write-Host "[OK] เปิดพอร์ต $Port บน Windows Firewall แล้ว" -ForegroundColor Green
  Write-Host "เข้าใช้งานจากภายนอกได้ที่: http://<PUBLIC_IP>:$Port" -ForegroundColor Cyan
} else {
  Write-Host "[ERROR] เปิดพอร์ตไม่สำเร็จ — ตรวจว่ารัน PowerShell แบบ Administrator หรือยัง" -ForegroundColor Red
}
