<div class="widgetAuthoring">
    <div class="widgetTop typeGenerator">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyTop">
            <div class="widgetBodyLeft">
                <div class="inletValue"><span rv-text="widget:inTrigger | rounded">0</span></div>
            </div>
            <div class="widgetBodyRight">
                <div class="inletValue"><span class="dataIndex" rv-text="widget:dataIndex">0</span></div>
            </div>

            
        </div>
        <div class="dataOut"><span rv-text="widget:out"></span></div>

        <select class="orderType" rv-value='widget:orderType'>
          <option value="ordered">ordered</option>
          <option value="reverse">reverse</option>
          <option value="randomFull">randFull</option>
          <option value="randomNoRepeat">randNoRep</option>
          <option value="randomAny">randAny</option>
        </select>
        <input class="dataTypeText" type="radio" value="text" rv-checked="widget:dataType"> Text Data<br>
        <input class="dataTypeNum" type="radio" value="number" rv-checked="widget:dataType"> Numeric Data
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>
            
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <strong>Text</strong><br>
            <label>delimiter</label> <input class="delimiter moreParam" type="text" rv-value="widget:delimiter"> (use &#92;n for newline)<br>
            <textarea class="database" rv-value="widget:database" rows="4" cols="70"></textarea>
            <hr>
            <strong>Numeric</strong><br>
            <label>range</label> <input class="numericMin moreParam" type="text" pattern="[0-9]*" rv-value="widget:numericMin">
            <input class="numericMax moreParam" type="text" pattern="[0-9]*" rv-value="widget:numericMax">
            <hr>
            <strong>Trigger Input Settings</strong><br>
            <label>range</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:rangeMin">
            <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:rangeMax"><br>
            <label>segments</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:segments"><br>
            <hr>
            <strong>Ordered Database</strong><br>
                <textarea rv-value="widget:orderedDatabase" rows="4" cols="70">

                </textarea>
        </div>
    </div>
</div>