<div class="settings open">
    <div class="logo"><img src="assets/images/ntk_logo.svg" alt="Netlab Toolkit"></div>
	<div class="savePatch">Save</div>
	<div class="loadPatch">Import</div>
    <div class="downloadPatch">Export</div>
	<div class="clearPatch">Clear</div>
	<form method="post" enctype="multipart/form-data" action="loadPatch" class="inputForm">
		<input type="file" name="images" id="patchFileUpload" style="display:none" />
	</form>
	<div class="hideWidgets">Show/Hide Widgets</div>
	<div class="fullScreen">Full Screen</div>
    <div class="serverSwitch">Run on Server</div>
</div>

<div class="addWidgets open">
<h1>Add Widgets</h1>
<div class="defaultDevice">
	<label class="narrowLabel">Device</label>
	<select class="defaultDeviceType">
		<option value="ArduinoUno">Serial</option>
		<option value="network">Network</option>
	</select>
	<div class="defaultDeviceIp">
		<label class="narrowLabel">ip</label>
		<input class="defaultDeviceAddress" type="text">
	</div>
	<div class="defaultDevicePort">
		<label class="narrowLabel">port</label>
		<input class="defaultDevicePortInput" type="text" pattern="[0-9]*">
	</div>
	<div class="defaultDeviceSerialPortPicker">
		<label class="narrowLabel">port</label>
		<select class="defaultSerialPortSelect">
			<option value="auto">Auto-detect</option>
		</select>
	</div>
</div>
<div class="networkInfo">
	<div class="patchUrlInfo">To see this patch in a browser on any device, go to <span class="localIpDisplay">this computer's IP</span>:9001.</div>
	<div class="softApInfo">When your remote device is running SoftAP, use this IP: 192.168.4.1</div>
</div>
<span id="messages"></span>
</div>

<div class="menuBar open">
	<div class="openAddWidgets"><span class="text">+</span></div>
	<div class="openSettings"><span class="text">=</span></div>
</div>
