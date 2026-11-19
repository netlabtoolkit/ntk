<div class="widgetAuthoring">
    <div class="headerPorts headerDone"><div class="outlet headerPort" data-field="done" alt="next" title="next: pulses on each key press (only the trigger key's when Trigger is checked)" rv-class-ctlflash="widget:done">&#9656;</div></div>
    <div class="widgetTop typeUI">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    
    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="inletValue">
                 <span rv-text="widget:in | rounded">0</span>
            </div>
        </div>
        <div class="widgetBodyRight">
            <div class="inletValue"><span class="outputSingle" rv-text="widget:out">0</span></div>
        </div>
        <div>
        <br><br><br>
        Trigger <input type="checkbox" rv-checked="widget:keyDetect" /> 
        <input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:keyDetectNum">
        <br>
        <table class="rangeTable" border="0" cellspacing="3" cellpadding="0">
          <tr>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputFloor"></td>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputCeiling"></td>
          </tr>
        </table>
        <hr>
        <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/keyboard/" target="_blank">Widget help</a>
        </div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:bodyOuts" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>
</div>