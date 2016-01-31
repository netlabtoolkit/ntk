<div class="widgetAuthoring">
    <div class="widgetTop typeLogic">
        <div class="title dragHandle">
        { widget:title } <div class="remove">x</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="ifTop">
            <div class="widgetBodyLeft ifInput">
                <div class="inletValue">
                    <span rv-text="widget:in | rounded">0</span>
                </div>
            </div>
            <div class="widgetBodyRight ifOutput">
                <div class="outletValue">
                    <input class="ifFalse outputParam" type="text" pattern="[0-9]*" rv-value="widget:ifFalse | rounded">
                    <input class="ifTrue outputParam" type="text" pattern="[0-9]*" rv-value="widget:ifTrue | rounded">
                </div>
            </div>
            <div class="inletValue ifStatement ifNumber">
                IF <select class="operator" rv-value="widget:operator">
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="~=">&#126;=</option>
                </select>
                <input class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:compareValue">
            </div>
            <div class="inletValue ifStatement ifText">
                IF <select class="operatorWide" rv-value="widget:operatorStr">
                  <option value="equals">equals</option>
                  <option value="contains">contains</option>
                  <option value="part">part</option>
                </select>
            </div>
        </div>
        <br>
        <input class="dataTypeNum" type="radio" value="number" rv-checked="widget:dataType"> Numeric Input<br>
        <input class="dataTypeText" type="radio" value="text" rv-checked="widget:dataType"> Text Input<br>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>
            
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <div class="ifNumber">
                <label>&#126;= range</label> <input class="moreParam" type="text" rv-value="widget:compareRange"><br>
                <label>wait true</label> <input class="moreParam" type="text" rv-value="widget:waitTimeTrue"><br>
                <label>wait false</label> <input class="moreParam" type="text" rv-value="widget:waitTimeFalse"><br>
            </div>
            <div class="ifText">
                text comparison string<br>
                <textarea class="database" rv-value="widget:text_comparison" rows="4" cols="70"></textarea>
            </div>
        </div>
    </div>
</div>