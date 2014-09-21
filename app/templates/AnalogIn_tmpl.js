<div class="widgetTop typeIn">
    <div class="title dragHandle">
        {widget:title} <div class="remove">×</div>
    </div>
</div>
<div class="widgetLeft">
    <div class=left-tab><input type="checkbox" rv-checked="widget:active" /></div>
    <div class=left-tab>
        <div rv-each-source="sources" class="settings">
            <input rv-value="source.map.sourceField">
        </div>
    </div>
</div>

<div class="widgetBody">
    <div class="dialwrapper" style="position:relative;">
        <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
        <div class="display invalue" rv-text="widget:in">100</div>
        <div class="display outvalue" rv-text="widget:out">1023</div>
    </div>
        
    <table class="rangeTable" border="0" cellspacing="3" cellpadding="0">
      <tr>
        <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputFloor"></td>
        <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputCeiling"></td>
      </tr>
    </table>

    <div class="options">
          <ul id="menu">
            <li title="invert" class='invert' rv-class-active="widget:invert">inv</li>
            <li title="smoothing">smo</li>
            <li title="easing">eas</li>
          </ul>
    </div>
</div>
<div class="widgetRight">
        <!-- <div class="outlet" draggable="true"></div> -->
    <div class='outlets'>
        <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to"><div class="dot">&middot;</div></div>
    </div>
</div>
