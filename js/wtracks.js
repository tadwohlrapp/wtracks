var map;
var track;
var waypoints;
var extremities;
var editLayer;
var route;
var routeStart;
var polystats;

/*
  setInteractive "plugin" from
  https://github.com/Leaflet/Leaflet/issues/5442#issuecomment-424014428
  Thanks https://github.com/Jadaw1n
*/
L.Layer.prototype.setInteractive = function (interactive) {
  if (this.getLayers) {
    arrayForEach(getLayers(), function (idx, layer) {
      layer.setInteractive(interactive);
    });
    return;
  }
  if (!this._path) {
    return;
  }

  this.options.interactive = interactive;

  if (interactive) {
    L.DomUtil.addClass(this._path, 'leaflet-interactive');
  } else {
    L.DomUtil.removeClass(this._path, 'leaflet-interactive');
  }
};

function setStatus(msg, options) {
  $("#status-msg").text(msg);
  var statusclass = options && options.class ? options.class : "status-info";
  $("#status-msg").attr("class", statusclass);
  var showspinner = options && !isUnset(options.spinner) && options.spinner;
  $("#spinner").toggle(showspinner);
  $("#status").fadeIn();
  if (options && options.timeout) {
    setTimeout(function() { clearStatus(); }, 1000 * options.timeout);
  }
}

function clearStatus() {
  $("#status").fadeOut(800);
}

setStatus("Loading...", { spinner: true });

$(window).on("load", function() {

  consentCookies();

  /* folding settings */
  function toggleElement(e) {
    $("." + this.id.slice(0, -1) + "-toggle").toggle();
  }
  $(".toggle").click(toggleElement);

  /* folding settings */
  function openFolder(id) {
    eltInfo = id.split("-");
    // hide all group
    $(".fold-" + eltInfo[0] + ":not(.fold-link)").hide();
    $(".fold-" + eltInfo[0] + "-closed").show();
    $(".fold-link.fold-" +  eltInfo[0]).removeClass("fold-selected");
    $(".fold-" + eltInfo[0] + "-closed").parent("div").removeClass("fold-selected-title");
    // show
    $("." + eltInfo[1]).show();
    $("#" + eltInfo[0] + "-" + eltInfo[1] + "-closed").hide();
    $("#" + eltInfo[0] + "-" + eltInfo[1]).addClass("fold-selected");
    $("#" + eltInfo[0] + "-" + eltInfo[1]).parent("div").addClass("fold-selected-title");
  }
  $(".fold").click(function(e) { openFolder(e.target.id); });

  // defaults
  openFolder("file-newtrk");
  openFolder("settings-savstg");

  function updateMapStyle() {
    if (!map.editTools) {
      // editor not yet intialized
      map.options.editOptions.lineGuideOptions.color = trackColor;
      map.options.editOptions.lineGuideOptions.weight = trackWeight;
    } else {
      // update editor
      map.editTools.forwardLineGuide.options.color = trackColor;
      map.editTools.forwardLineGuide.options.weight = trackWeight;
    }
  }

  map = L.map('map', {
    editable: true,
    editOptions: {
      lineGuideOptions: {
        opacity: 0.5
      }
    }
  });

  var NEW_TRACK_NAME = "New Track";
  var EMPTY_METADATA = { name: NEW_TRACK_NAME, desc: "" };

  var metadata = EMPTY_METADATA;
  var prunedist = getVal("wt.prunedist", config.compressdefault);
  var prunealt = getBoolVal("wt.prunealt", false);
  var wptLabel = getBoolVal("wt.wptLabel", config.display.wptLabel);
  var extMarkers = getBoolVal("wt.extMarkers", config.display.extMarkers);

  var EDIT_NONE = 0;
  var EDIT_MANUAL_TRACK = 1;
  var EDIT_AUTO_TRACK = 2;
  var EDIT_MARKER = 3;
  var EDIT_DEFAULT = EDIT_MANUAL_TRACK;
  var editMode = -1;

  var mapsCloseOnClick = getBoolVal("wt.mapsCloseOnClick", config.mapsCloseOnClick);
  var ghkey = getVal("wt.ghkey", undefined);
  var ggkey = getVal("wt.ggkey", undefined);
  var orskey = getVal("wt.orskey", undefined);
  var apikeyNoMore = getBoolVal("wt.apikeyNoMore", false);

  var MARKER_ICON = L.icon({
    iconUrl: 'img/marker-icon.png',
    iconRetinaUrl: 'img/marker-icon-2x.png',
    iconSize: [16, 26],
    iconAnchor: [8, 26],
    popupAnchor: [0, 0],
    shadowUrl: 'img/marker-shadow.png',
    shadowRetinaUrl: 'img/marker-shadow-2x.png',
    shadowSize: [26, 26],
    shadowAnchor: [8, 26]
  });
  var START_MARKER_ICON = L.icon({
    iconUrl: 'img/marker-start.png',
    iconSize: [17, 17],
    iconAnchor: [8, 8],
    popupAnchor: [0, 0]
  });
  var END_MARKER_ICON = L.icon({
    iconUrl: 'img/marker-end.png',
    iconSize: [17, 17],
    iconAnchor: [8, 8],
    popupAnchor: [0, 0]
  });

  var OFF_KEY = "OFF_";
  function getApiKey(apikey, defkey) {
    return !apikey || apikey.startsWith(OFF_KEY) ? defkey : apikey;
  }
  function getApiKeyVal(apikey) {
    return apikey.replace(OFF_KEY, "");
  }

  // load Google Maps API
  var gk = getApiKey(ggkey, config.google.mapsapikey());
  $.getScript("https://maps.googleapis.com/maps/api/js" + (gk ? "?key=" + gk : ""));

  // load Dropbox API
  $("#dropboxjs").attr("data-app-key", config.dropbox.key());
  $("#dropboxjs").attr("src", "https://www.dropbox.com/static/api/2/dropins.js");

  function setTrackName(name) {
    $("#track-name").text(name);
    $("#track-name").attr("title", name + " - Click to edit (F2)");
    document.title = config.appname + " - " + name;
    metadata.name = name;
  }

  function getTrackName() {
    return metadata.name;
  }

  function askTrackName() {
    var name = prompt("Track name:", getTrackName());
    if (name) {
      setTrackName(name);
    }
  }

  function validatePrompt() {
    setTrackName($("#prompt-name").val().trim());
    metadata.desc = $("#prompt-desc").val().trim();
    saveState();
    closeTrackNamePrompt();
  }

  function promptTrackName() {
    $("#prompt-name").val(getTrackName());
    $("#prompt-desc").val(metadata.desc);
    $("#prompt").show();
    $("#prompt-name").focus();
  }

  function closeTrackNamePrompt() {
    $("#prompt").hide();
  }

  function promptKeyEvent(event) {
    if (event.which == 27) {
      closeTrackNamePrompt();
    } else if ((event.keyCode == 13) && (event.target.tagName != "TEXTAREA")) {
      validatePrompt();
    }
  }

  $("#prompt-name").keyup(promptKeyEvent);
  $("#prompt-desc").keyup(promptKeyEvent);

  $("#prompt-ok").click(validatePrompt);
  $("#prompt-cancel").click(closeTrackNamePrompt);
  $("#track-name-edit").click(promptTrackName);

  /* ----------------------------------------------------- */

  var apikeyTimer;

  $("#apikeys-close").click(closeApiKeyInfo);


  function closeApiKeyInfo(evt) {
    if (apikeyTimer) {
      clearTimeout(apikeyTimer);
      apikeyTimer = undefined;
    }
    $("#apikeys").hide();
    changeApikeyNomore(isChecked("#apikeys-nomore"));
    if (evt) {
      evt.preventDefault();
    }
  }

  function openApiKeyInfo() {
    if (!apikeyNoMore && !apikeyTimer) {
      $("#apikeys").show();
      apikeyTimer = setTimeout(closeApiKeyInfo, 10000);
    }
  }

  function changeApikeyNomore(v) {
    apikeyNoMore = v;
    saveValOpt("wt.apikeyNoMore", apikeyNoMore);
    ga('send', 'event', 'setting', 'keysNomore', undefined, apikeyNoMore ? 1 : 0);
  }
  /* ----------------------------------------------------- */

  var selectActivity = $("#activity")[0];
  var activities = getJsonVal("wt.activities");

  function loadActivities() {
    if (jQuery.isEmptyObject(activities)) {
      activities = config.activities.defaults;
      saveJsonValOpt("wt.activities", activities);
    }
    // append activities
    objectForEach(activities, function(aname, aobj) {
      if (!selectActivity.options[aname]) {
        addSelectOption(selectActivity, aname);
      }
    });
    // remove deleted activities
    $("#activity option").each(function(i, v) {
      if (!activities[v.innerHTML]) {
        v.remove();
      }
    });
  }
  loadActivities();
  selectOption(selectActivity, getVal("wt.activity", Object.keys(activities)[0]));

  function getCurrentActivityName() {
    return getSelectedOption("#activity");
  }

  function getCurrentActivity() {
    var aname = getCurrentActivityName();
    var aerr = "";
    //log("activity: " + res);
    if (!aname) {
      ga('send', 'event', 'error', 'no current activity', "Stored: " + getVal("wt.activity"), Object.keys(activities).length);
      aerr = " nocura"
      aname = Object.keys(activities)[0];
      selectOption(selectActivity, aname);
    }
    var cura = activities[aname];
    if (!cura) {
      ga('send', 'event', 'error', 'activity not found', aname + aerr, Object.keys(activities).length);
      if (jQuery.isEmptyObject(activities)) {
        ga('send', 'event', 'error', 'no activity');
        loadActivities();
        aname = Object.keys(activities)[0];
        selectOption(selectActivity, aname);
        cura = activities[aname];
      }
    }
    saveValOpt("wt.activity", aname);
    return cura;
  }
  $("#activity").click(loadActivities);
  $("#activity").change(function() {
    ga('send', 'event', 'activity', 'change', getCurrentActivityName());
    polystats.setSpeedProfile(getCurrentActivity().speedprofile);
  });

  /* ------------------------------------------------------------*/

  function forEachSegment(func) {
    var count = 0;
    if (editLayer) {
      arrayForEach(editLayer.getLayers(), function(idx, segment) {
        // check if it is a polyline
        if (segment.getLatLngs) {
          count++;
          return func(segment);
        }
      });
    }
    return count;
  }

  function applySegmentTool(toolFunc) {
    var onAllSegments = isChecked("#allsegments");
    if (onAllSegments) {
      forEachSegment(toolFunc);
    } else {
      toolFunc(track);
    }
  }

  /* ------------------------------------------------------------*/

  function updateTrackStyle() {
    track.setStyle({
      color: trackUI.trk.getColor(),
      weight: trackUI.trk.getWeight()
    });
    track.setInteractive(false);
  }

  function updateOverlayTrackStyle(segment) {
    segment.setStyle({
      color: trackUI.ovl.getColor(),
      weight: trackUI.ovl.getWeight()
    });
    segment.setInteractive(true);
  }

  function updateAllOverlayTrackStyle() {
    forEachSegment(function(segment) {
      // check it is not current track
      if (segment != track) {
        updateOverlayTrackStyle(segment);
      }
    });
  }

  function setPolyStats() {
    polystats = L.polyStats(track, {
      chrono: true,
      speedProfile: getCurrentActivity().speedprofile,
      onUpdate: showStats,
    });
    if (!track.stats) {
      polystats.updateStatsFrom(0);
    }
    showStats();
  }

  function newSegment(noStats) {
    if (track) {
      if (getTrackLength() == 0) {
        // current track is empty, don't create another one
        return track;
      }
      updateOverlayTrackStyle(track);
    }
    track = L.polyline([]);
    editLayer.addLayer(track);
    track.on('click', segmentClickListener);
    if (!noStats) {
      setPolyStats();
    }
    updateTrackStyle();
    return track;
  }

  function getTrackLength() {
    return track ? track.getLatLngs().length : 0;
  }

  function createExtremities() {
    function createExtremity(name, icon) {
      var mkOpts = {
        title: name,
        alt: name,
        icon: icon,
        keyboard: false,
        interactive: false
      };
      var marker = L.marker([0,0], mkOpts);
      extremities.addLayer(marker);
    }
    extremities = L.featureGroup([]);
    editLayer.addLayer(extremities);
    createExtremity("Start", START_MARKER_ICON);
    createExtremity("End", END_MARKER_ICON);
    setExtrimityVisibility(extMarkers);
  }

  function setExtrimityVisibility(visible) {
    if (extremities) {
      if (visible && extMarkers && (getTrackLength() > 0)) {
        extremities.addTo(map);
      } else {
        extremities.remove();
      }
    }
  }

  function updateExtremity(latlng, i) {
    var eidx = -1;
    if (i == 0) {
      eidx = 0;
    } else if (i == getTrackLength() - 1) {
      eidx = 1;
    }
    if (eidx >= 0) {
      extremities.getLayers()[eidx].setLatLng(latlng);
    }
  }

  function updateExtremities() {
    if (extremities && track) {
      var last = getTrackLength() - 1;
      if (last >= 0) {
        updateExtremity(track.getLatLngs()[0], 0);
        updateExtremity(track.getLatLngs()[last], last);
      }
    }
  }

  $("#extMarkers").change(function(evt){
    extMarkers = !extMarkers;
    storeVal("wt.extMarkers", extMarkers);
    setExtrimityVisibility(extMarkers);
  });

  function newTrack() {
    metadata = EMPTY_METADATA;
    if (track) {
      editLayer.removeLayer(track);
      track = undefined;
    }
    if (waypoints) {
      editLayer.removeLayer(waypoints);
    }
    if (editLayer) {
      editLayer.remove();
    }
    if (route) {
      route.remove();
      route = undefined;
    }
    routeStart = undefined;
    editLayer = L.layerGroup([]).addTo(map);
    waypoints = L.featureGroup([]);
    editLayer.addLayer(waypoints);
    newSegment();
    createExtremities();
    setTrackName(NEW_TRACK_NAME);
  }

  function newWaypointTooltip(wtp) {
    var ttip = wtp.bindTooltip(wtp.options.title, {permanent: wptLabel});
    if (wptLabel) {
      ttip.openTooltip();
    }
  }

  function newWaypoint(latlng, properties, wptLayer) {

    function deleteMarker(e) {
      waypoints.removeLayer(marker);
      map.closePopup();
      e.preventDefault();
    }

    function getMarkerPopupContent(marker) {
      var div = L.DomUtil.create('div', "popupdiv"),
        label;

      if (editMode === EDIT_MARKER) {

        // name
        label = L.DomUtil.create('div', "popupdiv", div);
        label.innerHTML = "<span class='popupfield'>Name:</span> ";
        var name = L.DomUtil.create('input', "popup-nameinput", label);
        name.type = "text";
        name.placeholder = "Textual name";
        $(name).val(marker.options.title ? marker.options.title : "");
        name.onkeyup = function() {
          var nameval = $(name).val().trim();
          marker.options.title = nameval;
          marker.getTooltip().setContent(nameval);
          var elt = marker.getElement();
          elt.alt = nameval;
        };

        // description
        label = L.DomUtil.create('div', "popupdiv", div);
        label.innerHTML = "<span class='popupfield'>Desc:</span>";
        var richtxtlbl = L.DomUtil.create('label', "rich-text", label);
        var richtxtcb = L.DomUtil.create('input', "rich-text", richtxtlbl);
        richtxtcb.type = 'checkbox';
        $(richtxtlbl).append("Rich text");
        var desc = L.DomUtil.create('textarea', "popup-descinput", label);
        desc.placeholder = "Textual/HTML description";
        $(desc).val(marker.options.desc ? marker.options.desc : "");
        desc.onkeyup = function() {
          var descval = $(desc).val();
          marker.options.desc = descval;
        };

        var setRichDesc = function() {
          var h = Math.max(120, $(desc).height());
          $(desc).attr('origheight', h);
          $(desc).trumbowyg({
              btns: [
                'formatting',
                ['strong', 'em', 'underline', 'removeformat'],
                ['link', 'insertImage'],
                'btnGrp-lists',
                ['horizontalRule']
              ],
              autogrow: false
          })
          .on('tbwchange', desc.onkeyup)
          .on('tbwinit', function() {
            $("div.trumbowyg-editor, .trumbowyg-box").css('min-height', h);
          });
        };

        $(richtxtcb).change(function(){
          if (isChecked(richtxtcb)) {
            setRichDesc();
          } else {
            $(".popup-descinput").trumbowyg('destroy');
            $(".popup-descinput").height($(".popup-descinput").attr('origheight'));
          }
        });
        if (marker.options.desc && marker.options.desc.indexOf("<") >= 0) {
          setChecked(richtxtcb, 'checked');
          setRichDesc();
        }

      } else {

        // name
        if (marker.options.title) {
          var popupName = L.DomUtil.create('div', "popup-name", div);
          popupName.innerHTML = marker.options.title;
        }

        // description
        if (marker.options.desc) {
          var popupDesc = L.DomUtil.create('pre', "popup-desc", div);
          popupDesc.innerHTML = marker.options.desc;
        }

      }

      // cmt
      if (marker.options.cmt) {
        var popupCmt = L.DomUtil.create('pre', "popup-desc", div);
        popupCmt.innerHTML = marker.options.cmt;
      }

      // time
      if (marker.options.time) {
        var popupTime = L.DomUtil.create('pre', "popup-desc", div);
        popupTime.innerHTML = marker.options.time;
      }


      var latlng = marker.getLatLng();
      var markerDiv = getLatLngPopupContent(latlng, deleteMarker, undefined, div);
      return markerDiv;
    }

    var wptOpts = {
      title: properties.name || "",
      alt: properties.name || "",
      desc: properties.desc || properties.description || "",
      cmt: properties.cmt || undefined,
      time: properties.time || undefined,
      icon: MARKER_ICON
    };
    var marker = L.marker(latlng, wptOpts);
    wptLayer.addLayer(marker);

    if (wptLayer == waypoints) {
      marker.getElement().removeAttribute("title"); // remove default HTML tooltip
      newWaypointTooltip(marker);
      marker.on("click", function() {
        pop = L.popup({ "className" : "overlay" })
          .setLatLng(marker.getLatLng())
          .setContent(getMarkerPopupContent(marker))
          .openOn(map);
      });
    }

    return marker;
  }

  $("#wptLabel").change(function(evt){
    wptLabel = !wptLabel;
    storeVal("wt.wptLabel", wptLabel);
    arrayForEach(waypoints.getLayers(), function (idx, wpt) {
      // create new tooltip (they're not mutable!)
      wpt.unbindTooltip();
      newWaypointTooltip(wpt);
    })
  });

  /* ------------------------ TRIMMING ---------------------------------- */

  var polytrim;

  function prepareTrim() {
    var trimMax = Math.round(getTrackLength() / 2);
    $("#trim-txt").text("");
    $("#trim-range").attr("max", trimMax);
    $("#trim-range").val(0);
    $(".no-trim").prop('disabled', false);
    var trimType = $("#trim-type")[0].selectedIndex;
    polytrim = L.polyTrim(track, trimType);
  }

  function trimTrack(e) {
    var n = parseInt($("#trim-range").val());
    log("trimming " + n);
    $("#trim-txt").text(n + "/" + polytrim.getPolySize());
    $(".no-trim").prop('disabled', (n !== 0));
    polytrim.trim(n);
  }

  function finishTrim() {
    var n = parseInt($("#trim-range").val());
    if (n > 0) {
      ga('send', 'event', 'tool', 'trim', undefined, n);
      if (polytrim.getDirection() === polytrim.FROM_END) {
        // From End
        polystats.updateStatsFrom(getTrackLength() - 1);
      } else {
        // From Start
        polystats.updateStatsFrom(0);
      }
      saveState();
      polytrim = undefined;
      $("#trim-range").val(0);
    }
  }

  $("#trim-range").on("change", trimTrack);
  $("#trim-type").change(prepareTrim);

  /* --------------------------------------*/
  // Track display settings

  var trackColor;
  var trackWeight;
  var ovlTrackColor;
  var ovlTrackWeight;
  var trackUI = {
    trk: {
      getDefaultColor : function() {
        return config.display.trackColor;
      },
      getColor : function() {
        return trackColor;
      },
      setColor : function(v) {
        trackColor = v;
        saveValOpt("wt.trackColor", v);
        updateTrackStyle();
        updateMapStyle();
      },
      getDefaultWeight : function() {
        return config.display.trackWeight;
      },
      getWeight : function() {
        return trackWeight;
      },
      setWeight : function(v) {
        trackWeight = v;
        saveValOpt("wt.trackWeight", v);
        updateTrackStyle();
        updateMapStyle();
      }
    },
    ovl: {
      getDefaultColor : function() {
        return config.display.ovlTrackColor;
      },
      getColor : function() {
        return ovlTrackColor;
      },
      setColor : function(v) {
        ovlTrackColor = v;
        saveValOpt("wt.ovlTrackColor", v);
        updateAllOverlayTrackStyle();
      },
      getDefaultWeight : function() {
        return config.display.ovlTrackWeight;
      },
      getWeight : function() {
        return ovlTrackWeight;
      },
      setWeight : function(v) {
        ovlTrackWeight = v;
        saveValOpt("wt.ovlTrackWeight", v);
        updateAllOverlayTrackStyle();
      }
    }
  };
  var trackUISetting = trackUI.trk;
  trackColor = getVal("wt.trackColor", trackUI.trk.getDefaultColor());
  trackWeight = getVal("wt.trackWeight", trackUI.trk.getDefaultWeight());
  ovlTrackColor = getVal("wt.ovlTrackColor", trackUI.ovl.getDefaultColor());
  ovlTrackWeight = getVal("wt.ovlTrackWeight", trackUI.ovl.getDefaultWeight());
  updateMapStyle();

  $("input:radio[name=track-type]").on("change", function(event){
    var t = $("input:radio[name=track-type]:checked").val();
    trackUISetting = trackUI[t];
    initTrackDisplaySettings();
  });
  $("#track-color").on("change", function(event){
    var v = $("#track-color").val();
    ga('send', 'event', 'setting', 'trackColor', v);
    trackUISetting.setColor(v);
  });
  $("#track-weight").on("change", function(event){
    var v = $("#track-weight").val();
    ga('send', 'event', 'setting', 'trackWeight', v);
    $("#track-weight-v").text(v);
    trackUISetting.setWeight(v);
  });
  $("#track-resetcolorweight").on("click", function(){
    trackUISetting.setColor(trackUISetting.getDefaultColor());
    trackUISetting.setWeight(trackUISetting.getDefaultWeight());
    ga('send', 'event', 'setting', 'trackReset');
    initTrackDisplaySettings();
  });
  function initTrackDisplaySettings() {
    var v;
    v = trackUISetting.getColor();
    $("#track-color").val(v);
    $("#track-color-picker")[0].jscolor.fromString(v);
    v = trackUISetting.getWeight();
    $("#track-weight").val(v);
    $("#track-weight-v").text(v);
  }

  /* --------------------------------------*/
  // API keys

  function showApiKey(name, value) {
    var useDefault = isUndefined(getApiKey(value));
    var input = $("#" + name + "-value");
    //debug(name + ": " + value);
    setChecked("#" + name + "-chk", !useDefault);
    input.val(isUndefined(value) ? "" : getApiKeyVal(value));
    input.attr("disabled", useDefault);
  }

  function updateApiKey(name) {
    var useDefault = !isChecked("#" + name + "-chk");
    var key = $("#" + name + "-value").val().trim();
    if (key === "") {
      key = undefined;
    } else if (useDefault) {
      key = OFF_KEY + key;
    }
    var gav = useDefault ? -1 : key ? 1 : 0;
    ga('send', 'event', 'setting', 'keys', name, gav);
    //debug(name + "= " + key + " (" + gav + ")");
    saveValOpt("wt." + name, key);
    return key;
  }

  function updateApiServices() {

    // elevation
    if (getApiKey(ggkey)) {
      $("#elevation-srv").text("Google");
      $("#elevation-key").text("your");
    } else if (getApiKey(orskey)) {
      $("#elevation-srv").text("OpenRoute");
      $("#elevation-key").text("your");
    } else {
      $("#elevation-srv").text("OpenElevation");
      $("#elevation-key").text("no");
    }

    // routing
    if (getApiKey(ghkey)) {
      $("#routing-srv").text("GraphHopper");
      $("#routing-key").text("your");
    } else {
      if (getApiKey(orskey)) {
        $("#routing-srv").text("OpenRoute");
        $("#routing-key").text("your");
      } else {
        $("#routing-srv").text("GraphHopper");
        $("#routing-key").text("WTracks");
      }
    }

    setElevationService();
  }

  function checkApikey(name) {
    var useDefault = !isChecked("#" + name + "-chk");
    $("#" + name + "-value").attr("disabled", useDefault);
    var key = updateApiKey(name);
    return key;
  }

  function apiKeyChange(evt) {
    var keyname = evt.target.id.match(/^[^\\-]+/)[0];
    window[keyname] = checkApikey(keyname);
    updateApiServices();
  }
  $(".key-chk").on("change", apiKeyChange);
  $(".key-value").on("focusout", apiKeyChange);

  function resetApiKey(name) {
    setChecked("#" + name + "-chk", false);
    $("#" + name + "-value").val("");
    $("#" + name + "-chk").change();
  }

  $("#keys-reset").on("click", function() {
    ga('send', 'event', 'setting', 'keys', 'reset');
    resetApiKey("orskey");
    resetApiKey("ghkey");
    resetApiKey("ggkey");
  });

  showApiKey("orskey", orskey);
  showApiKey("ghkey", ghkey);
  showApiKey("ggkey", ggkey);
  updateApiServices();

  $("#apikeys-suggest").change(function() {
    changeApikeyNomore(!isChecked("#apikeys-suggest"));
  });

  /* ------------------------ MENU ---------------------------------- */

  function closeMenu() {
    $("#menu").hide();
    finishTrim();
  }

  function openMenu(tab) {
    if (isMenuVisible()) return;
    setEditMode(EDIT_NONE);
    setChecked("#merge", false);
    setChecked("#apikeys-suggest", !apikeyNoMore);
    setChecked("#wptLabel", wptLabel);
    setChecked("#extMarkers", extMarkers);
    prepareTrim();
    $("#prunedist").val(prunedist);
    setChecked("#prunealt", prunealt);
    menu(tab ? tab : "file");
  }
  function isMenuVisible() {
    return $("#menu").is(":visible");
  }

  $("#menu-close").click(function() {
    closeMenu();
    return false;
  });
  $("#track-new").click(function() {
    ga('send', 'event', 'file', 'new');
    newTrack();
    setEditMode(EDIT_MANUAL_TRACK);
    saveState();
    closeMenu();
  });
  $("#menu-track").click(function() {
    $(".collapsable-track").toggle();
  });
  $("#menu-tools").click(function() {
    $(".collapsable-tools").toggle();
  });

  /* ------------------------ EXPORT GPX ---------------------------------- */

  function LatLngToGPX(ptindent, latlng, gpxelt, properties) {

    var gpx = ptindent + "<" + gpxelt;
    gpx += " lat=\"" + latlng.lat + "\" lon=\"" + latlng.lng + "\">";
    if (properties.title) {
      gpx += "<name>" + htmlEncode(properties.title) + "</name>";
    }
    if (properties.desc) {
      gpx += "<desc>" + htmlEncode(properties.desc) + "</desc>";
    }
    if (!isNaN(latlng.alt)) {
      gpx += "<ele>" + latlng.alt + "</ele>";
    }
    if (properties.cmt) {
      gpx += "<cmt>" + htmlEncode(properties.cmt) + "</cmt>";
    }
    if (properties.time) {
      gpx += "<time>" + properties.time + "</time>";
    }
    if (properties.ext) {
      gpx += "\n" + ptindent + "  <extensions>";
      gpx += properties.ext;
      gpx += "</extensions>\n" + ptindent;
    }
    gpx += "</" + gpxelt + ">\n";
    return gpx;
  }

  function getSegmentGPX(segment, ptindent, pttag, savetime) {
    var now = new Date();
    var gpx = "";
    var latlngs = segment ? segment.getLatLngs() : undefined;
    if (latlngs && latlngs.length > 0) {
      var j = 0;
      now = now.getTime();
      while (j < latlngs.length) {
        var pt = latlngs[j];
        var time = pt.time;
        try {
          if (savetime && Date.prototype.toISOString && pt.chrono) {
            time = new Date(now + (pt.chrono * 1000)).toISOString();
          }
        } catch (error) {
          ga('send', 'event', 'error', 'Failed to build ISO time: ' + error, 'chrono: ' + pt.chrono);
        }
        gpx += LatLngToGPX(ptindent, pt, pttag, { 'time': time, 'ext' : pt.ext });
        j++;
      }
    }
    return gpx;
  }

  function getGPX(trackname, savealt, savetime, asroute, nometadata) {

    var now = new Date();
    var xmlname = "<name>" + htmlEncode(trackname) + "</name>";
    var gpx = '<\?xml version="1.0" encoding="UTF-8" standalone="no" \?>\n';
    gpx += '<gpx creator="' + config.appname + '"\n';
    gpx += '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" version="1.1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"';

    // xmlns from each segment
    var xmlnsArr = [];
    arrayForEach(editLayer.getLayers(), function(idx, segment) {
      if (segment.xmlnsArr && segment.xmlnsArr.length) {
        for (var i = 0; i < segment.xmlnsArr.length; i++) {
          var item = segment.xmlnsArr[i];
          if (xmlnsArr.indexOf(item) < 0) {
            gpx += '\n    ' + item;
            xmlnsArr.push(item);
          }
        }
      }
    });
    gpx += '>\n';

    if (!nometadata) {
      gpx += "<metadata>\n";
      gpx += "  " + xmlname + "\n";
      gpx += "  <desc>" + (metadata.desc ? htmlEncode(metadata.desc) : "") + "</desc>\n";
        gpx += "  <author><name>" + config.appname + "</name></author>\n";
      gpx += "  <link href='" + window.location.href + "'>\n";
      gpx += "    <text>" + config.appname + "</text>\n";
      gpx += "    <type>text/html</type>\n";
      gpx += "  </link>\n";
      gpx += "  <time>" + now.toISOString() + "</time>\n";
      var sw = map.getBounds().getSouthWest();
      var ne = map.getBounds().getNorthEast();
      gpx += '  <bounds minlat="' + Math.min(sw.lat, ne.lat) + '" minlon="' + Math.min(sw.lng, ne.lng) + '" maxlat="' + Math.max(sw.lat, ne.lat) + '" maxlon="' + Math.max(sw.lng, ne.lng) + '"/>\n';
      gpx += "</metadata>\n";
    }

    // Waypoints
    var wpts = waypoints ? waypoints.getLayers() : undefined;
    if (wpts && wpts.length > 0) {
      var i = 0;
      while (i < wpts.length) {
        var wpt = wpts[i];
        gpx += LatLngToGPX("", wpt.getLatLng(), "wpt", wpt.options);
        i++;
      }
    }

    var ptindent, pttag, wraptag, segtag;
    if (asroute) {
      ptindent = "  ";
      wraptag = "rte";
      pttag = "rtept";
    } else {
      ptindent = "    ";
      wraptag = "trk";
      pttag = "trkpt";
      segtag = "trkseg";
    }

    gpx += "<" + wraptag + ">" + xmlname + "\n";
    // for each segment
    arrayForEach(editLayer.getLayers(), function(idx, segment) {
      // check if it is a polyline
      if (segment.getLatLngs) {
        if (segtag) {
          gpx += "  <" + segtag + ">\n";
        }
        gpx += getSegmentGPX(segment, ptindent, pttag, savetime);
        if (segtag) {
          gpx += "  </" + segtag + ">\n";
        }
      }
    });

    gpx += "</" + wraptag + "></gpx>\n";
    return gpx;
  }

  function getConfirmedTrackName() {
    var trackname = getTrackName();
    if (!trackname || trackname === NEW_TRACK_NAME) {
      askTrackName();
      trackname = getTrackName();
    }
    return trackname;
  }

  function getTrackGPX(doConfirmName) {
    var asroute = isChecked("#as-route");
    var nometadata = isChecked("#nometadata");
    var savetime = isChecked("#savetiming");
    var trackname = doConfirmName ? getConfirmedTrackName() : getTrackName();
    return getGPX(trackname, /*savealt*/ false, savetime, asroute, nometadata);
  }

  $("#track-download").click(function() {
    setEditMode(EDIT_NONE);
    setStatus("Formatting..", { spinner: true });
    var gpx = getTrackGPX(true);
    ga('send', 'event', 'file', 'save', undefined, Math.round(gpx.length / 1000));
    try {
      var blob = new Blob([gpx],
        isSafari() ? {type: "text/plain;charset=utf-8"} : {type: "application/gpx+xml;charset=utf-8"}
      );
      saveAs(blob, getTrackName() + ".gpx");
      clearStatus();
    } catch (err) {
      setStatus("Failed: " + err, { timeout: 5, class: "status-error" });
    }
    closeMenu();
  });

  //---------------------------------------------------
  // Share

  $("#track-share").click(function() {
    closeMenu();
    $("#wtshare-map-name").text(baseLayer);
    $("#wtshare-ask").show();
    $("#wtshare-processing").hide();
    $("#wtshare-done").hide();
    $("#wtshare-val").val("");
    $("#wtshare-box").show();
    $("#wtshare-start").focus();
    if (isCryptoSupported()) {
      $(".if-encrypt").show();
    }
  });
  function closeShareBox(){
    $("#wtshare-box").hide();
  }
  $("#wtshare-box-close").click(closeShareBox);
  $("#wtshare-cancel").click(closeShareBox);
  $("#wtshare-ok").click(closeShareBox);

  function uploadClicked(){
    $("#wtshare-ask").hide();
    $("#wtshare-processing").show();
    var gpx = getTrackGPX(true);
    var params = "";
    if (isChecked("#wtshare-map")) {
      params += "&map=" + encodeURIComponent(baseLayer);
    }
    if (isChecked("#wtshare-enc")) {
      var pwd = Math.random().toString(36).substring(2);
      aesGcmEncrypt(gpx, pwd)
      .then(function(cipher) {
        //log("iv  : " + cipher.iv);
        //log("pwd : " + pwd);
        var encversion = "01";
        params += "&key=" + encversion + strencode(cipher.iv + pwd);
        gpx = cipher.ciphertext;
        ga('send', 'event', 'file', 'encrypt', undefined, Math.round(gpx.length / 1000));
        shareGpx(gpx, params, "cipher-yes");
      })
      .catch(function(err) {
        ga('send', 'event', 'error', 'crypto-encrypt', err);
        setStatus("Failed: " + err, { timeout: 5, class: "status-error" });
        $("#wtshare-box").hide();
      });
    } else {
      shareGpx(gpx, params, isCryptoSupported() ? "cipher-no" : "cipher-unavailable");
    }
  }

  function shareGpx(gpx, params, cryptoMode) {
    ga('send', 'event', 'file', 'share', share.name + ', ' + cryptoMode, Math.round(gpx.length / 1000));
    share.upload(
      getTrackName(), gpx,
      function (gpxurl, rawgpxurl) {
        var url = window.location.toString();
        url = url.replace(/#+.*$/,""); // remove fragment
        url = url.replace(/\?.*$/,""); // remove parameters
        url = url.replace(/index\.html$/,""); // remove index.html
        url = url.replace(/\/*$/,"/"); // keep 1 and only 1 trailing /
        url = url + "?ext=gpx&noproxy=true&url=" + encodeURIComponent(rawgpxurl) + params;
        $("#wtshare-val").val(url);
        $("#wtshare-open").attr("href", url);
        $("#wtshare-view").attr("href", gpxurl);
        $("#wtshare-processing").hide();
        $("#wtshare-links").show();
        $("#wtshare-qrcode").hide();
        $("#wtshare-qrimg").attr("src", config.qrCodeService + encodeURIComponent(url + "&qr=1"));
        $("#wtshare-done").show();
        $("#wtshare-val").focus();
        $("#wtshare-val").select();
      }, function(error) {
        var errmsg = error.statusText || error;
        ga('send', 'event', 'error', 'share ' +  share.name + ' ' + cryptoMode, errmsg, Math.round(gpx.length / 1000));
        alert("Upload failed, is file too big? Reduce it using Tools/Compress");
        setStatus("Failed: " + errmsg, { timeout: 5, class: "status-error" });
        $("#wtshare-box").hide();
      });
  }

  function showQRCode(e){
    $("#wtshare-links").hide();
    $("#wtshare-qrcode").show();
    return false;
  }
  function hideQRCode(e){
    $("#wtshare-links").show();
    $("#wtshare-qrcode").hide();
    return false;
  }

  $("#wtshare-start").click(uploadClicked);
  $("#wtshare-viewqr").click(showQRCode);
  $("#wtshare-back").click(hideQRCode);

  function closeShareBoxOnEscape(event) {
    if (event.which == 27) {
      closeShareBox();
      event.stopPropagation();
    }
  }
  $("#wtshare-start").keyup(closeShareBoxOnEscape);
  $("#wtshare-cancel").keyup(closeShareBoxOnEscape);
  $("#wtshare-val").keyup(closeShareBoxOnEscape);
  $("#wtshare-ok").keyup(closeShareBoxOnEscape);

  var sharename = getVal("wt.share", undefined);
  var share = (sharename && pastesLib[sharename]) || pastesLib[Object.keys(pastesLib)[0]];

  // fileio automatically deletes paste after download, perfect for dropbox use case
  var dropboxTempShare = sharename ? pastesLib[sharename] : pastesLib.fileio;

  //---------------------------------------------------

  function setInactiveSegmentClickable(clickable) {
    forEachSegment(function(segment) {
      if (segment != track) {
        segment.setInteractive(clickable);
      }
    });
  }

  function editableWaypoints(editable) {
    var wpts = waypoints.getLayers();
    for (var i = 0; i < wpts.length; i++) {
      if (editable) {
        wpts[i].enableEdit();
      } else {
        wpts[i].disableEdit();
      }
    }
  }

  function mergeRouteToTrack() {
    routeStart = undefined;
    if (!route) return;
    var initlen = getTrackLength();
    var pts = route._selectedRoute ? route._selectedRoute.coordinates : undefined;
    if (pts && (pts.length > 0)) {
      pts = L.PolyPrune.prune(pts, { tolerance: config.compressdefault, useAlt: true });
      ga('send', 'event', 'edit', 'merge', undefined, pts.length);
      for (var j = 0; j < pts.length; j++) {
        track.addLatLng(pts[j]);
      }
      updateExtremities();
      elevate(pts, function(success) {
        polystats.updateStatsFrom(initlen);
        saveState();
      });
    }
    route.clearAllEventListeners();
    route.remove();
    route._line = undefined;
    route = undefined;
  }

  function setRouteStart(latlng) {
    routeStart = latlng;
    $("#map").css("cursor", "alias");
  }

  function closeOverlays() {
    // close all
    map.closePopup();
    hideElevation();
  }

  function restartRoute() {
    if (route) {
      route.remove();
      route = undefined;
      routeStart = undefined;
    }
    $("#map").css("cursor", "copy");
    var ll = track.getLatLngs();
    if (ll.length > 0) {
      setRouteStart(ll[ll.length - 1]);
    }
  }

  function showGraphHopperCredit() {
    $("#map").append("<span class='gh-credit'>Powered by <a href='https://graphhopper.com/#directions-api'>GraphHopper API</a></span>");
  }

  function hideGraphHopperCredit() {
    $(".gh-credit").remove();
  }

  function showGraphHopperMessage(msg) {
    setStatus(msg, { timeout: 5, class: "status-error" });
    openApiKeyInfo();
  }

  function setEditMode(mode) {
    closeOverlays();
    if (mode === editMode) {
      return;
    }
    if ((mode != EDIT_NONE) && !map.editTools) {
      ga('send', 'event', 'error', "no editTools", navigator.userAgent);
      alert("Your browser does not support GPX editing");
      return;
    }
    switch (editMode) {
      case EDIT_MANUAL_TRACK:
        if (track) {
          track.disableEdit();
        }
        break;
      case EDIT_AUTO_TRACK:
        hideGraphHopperCredit();
        mergeRouteToTrack();
        break;
      case EDIT_MARKER:
        editableWaypoints(false);
        break;
      default:
    }
    map.editTools.stopDrawing();
    $("#edit-tools a").removeClass("control-selected");
    if (editMode > 0) { // exiting edit mode
      saveState();
      // reset mouse pointer
      $("#map").css("cursor", "");
    }
    setExtrimityVisibility(false);
    switch (mode) {
      case EDIT_NONE:
        setExtrimityVisibility(true);
        setInactiveSegmentClickable(true);
        break;
      case EDIT_MANUAL_TRACK:
        $("#edit-manual").addClass("control-selected");
        track.enableEdit();
        track.editor.continueForward();
        setInactiveSegmentClickable(false);
        break;
      case EDIT_AUTO_TRACK:
        $("#edit-auto").addClass("control-selected");
        showGraphHopperCredit();
        restartRoute();
        setInactiveSegmentClickable(false);
        break;
      case EDIT_MARKER:
        setExtrimityVisibility(true);
        $("#edit-marker").addClass("control-selected");
        $("#map").css("cursor", "url(img/marker-icon.cur),text");
        $("#map").css("cursor", "url(img/marker-icon.png) 7 25,text");
        editableWaypoints(true);
        setInactiveSegmentClickable(false);
        break;
      default:
        error("invalid edit mode: " + mode);
        return;
    }
    editMode = mode;
    saveEditMode();
    $("#edit-tools").toggle(editMode > 0);
  }

  $("#compress").click(function() {

    // get & check input value
    var prunedistelt = $("#prunedist");
    var input = prunedistelt.val().trim();
    if (input && input.match(/^\d+\.?\d*$/)) {
      prunedist = parseFloat(input);
    } else {
      input = undefined;
    }
    if (!input || (prunedist === undefined) || isNaN(prunedist)) {
      alert("Enter distance in meters");
      prunedistelt.focus();
      return;
    }
    if (isImperial()) {
      prunedist *= 0.9144;
    }
    prunealt = isChecked("#prunealt");

    saveValOpt("wt.prunedist", prunedist);
    saveValOpt("wt.prunealt", prunealt);

    if (track) {

      var removedpts = 0;
      var totalpts = 0;

      applySegmentTool(function (segment) {
        var pts = segment.getLatLngs();
        var pruned = L.PolyPrune.prune(pts, { tolerance: prunedist, useAlt: prunealt });
        totalpts += pts.length;
        var reduced = pts.length - pruned.length;
        if (reduced > 0) {
          // switch to new values
          removedpts += reduced;
          segment.setLatLngs(pruned);
          if (segment == track) {
            polystats.updateStatsFrom(0);
          }
        }
      });

      if (removedpts > 0) {
        ga('send', 'event', 'tool', 'compress', undefined, removedpts);
        alert("Removed " + removedpts + " points out of " + totalpts + " (" + Math.round((removedpts / totalpts) * 100) + "%)");
        saveState();
      } else {
        setStatus("Already optimized", { timeout: 3 });
      }

    }
  });

  function joinSegments() {
    var seg1;
    var count = forEachSegment(function(segment) {
      if (!seg1) {
        seg1 = segment;
      } else {
        seg1.setLatLngs(seg1.getLatLngs().concat(segment.getLatLngs()));
        segment.remove();
        segment.removeFrom(editLayer);
      }
    });
    if (count > 1) {
      track = null;
      segmentClickListener({target: seg1}, true);
      saveState();
      polystats.updateStatsFrom(0);
      setStatus("Joined " + count + " segments", { timeout: 3 });
      ga('send', 'event', 'tool', 'join', undefined, count);
    } else {
      setStatus("No segments to join", { timeout: 3 });
    }
  }

  $("#join").click(joinSegments);

  var joinOnLoad = false; // deactivate while we restore saved GPX

  // geolocation

  function getMyIpLocation() {
    log("Getting location from IP address");
    $.get("//extreme-ip-lookup.com/json/")
    .done(function(res) {
      setLocation({
        lat: res.lat,
        lng: res.lon
      }, false);
    })
    .fail(function(jqxhr, settings, exception) {
      warn("ip geolocation request failed");
    });
  }

  var myLocIcon = L.icon({
    iconUrl: 'img/mylocation.png',
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });
  var myLocMarker;
  var myLocTimer;
  var
    LOC_NONE = 0,
    LOC_ONCE = 1,
    LOC_CONTINUOUS = 2,
    showLocation = LOC_ONCE;

  function removeMyLocMarker() {
    if (showLocation == LOC_CONTINUOUS) {
      gotoMyLocation();
    } else {
      showLocation = LOC_NONE;
      if (myLocMarker) {
        myLocMarker.remove();
        myLocMarker = undefined;
      }
    }
  }

  function setLocation(pos, showIcon) {
    if (showLocation == LOC_NONE) return; // cancelled in the meantime
    var zoom = map.getZoom() ? map.getZoom() : config.display.zoom;
    map.setView(pos, zoom);
    if (myLocMarker) {
      clearTimeout(myLocTimer);
      myLocMarker.remove();
    }
    if (showIcon) {
      myLocMarker = new L.marker([pos.lat, pos.lng], { icon: myLocIcon, clickable: false });
      myLocMarker.addTo(map);
    }
    if (showIcon || (showLocation == LOC_CONTINUOUS)) {
      myLocTimer = setTimeout(removeMyLocMarker, 5000);
    } else {
      showLocation = LOC_NONE;
    }
  }

  function gotoMyLocation() {

    function gotLocation(position) {
      log("Got location");
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }, true);
    }

    function highAccuracyFailed(posError) {
      log("GPS location failed, trying low accuracy");
      navigator.geolocation.getCurrentPosition(
        gotLocation, lowAccuracyFailed, { maximumAge: 60000, timeout: 5000, enableHighAccuracy: false });
    }

    function lowAccuracyFailed(posError) {
      log("low accuracy geolococation failed");
      getMyIpLocation();
    }


    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        gotLocation, highAccuracyFailed, { maximumAge: 0, timeout: 5000, enableHighAccuracy: true });
    } else {
      log("no runtime geolococation available");
      getMyIpLocation();
    }
  }

  function getSavedPosition(_lat, _lng) {
    var vlat = getVal("wt.poslat", _lat);
    var vlng = getVal("wt.poslng", _lng);
    var pos = {
      lat: parseFloat(vlat),
      lng: parseFloat(vlng)
    };
    // ask for position on first use
    if (vlat == _lat && vlng == _lng) {
      setTimeout(function() {
        showLocation = LOC_ONCE;
        gotoMyLocation();
      }, 1000);
    }
    return pos;
  }

  function savePosition() {
    var pos = map.getCenter();
    saveValOpt("wt.poslat", pos.lat);
    saveValOpt("wt.poslng", pos.lng);
  }

  function saveEditMode() {
    if (editMode >= 0) saveValOpt("wt.editMode", editMode);
  }

  function saveTrack() {
    var trackname = getTrackName();
    // Count points to save
    // 1. waypoints
    var numPts = waypoints.getLayers().length;
    // 2. All segment points
    forEachSegment(function(segment) {
        numPts += segment.getLatLngs().length;
    });
    // Don't save if more than 1500 points
    if (numPts < 1500) {
      var gpx = getGPX(trackname, /*savealt*/ false, /*savetime*/ false, /*asroute*/ false, /*nometadata*/ false);
      saveValOpt("wt.gpx", gpx);
    }
  }

  function saveSettings() {
    saveValOpt("wt.activity", getCurrentActivityName());
    saveJsonValOpt("wt.activities", activities);
    saveValOpt("wt.baseLayer", baseLayer);
    saveValOpt("wt.ggkey", ggkey);
    saveValOpt("wt.ghkey", ghkey);
    saveValOpt("wt.orskey", orskey);
    saveValOpt("wt.joinOnLoad", joinOnLoad);
    saveJsonValOpt("wt.mymaps", mymaps);
    saveJsonValOpt("wt.overlaysOn", overlaysOn);
    saveValOpt("wt.ovlTrackColor", ovlTrackColor);
    saveValOpt("wt.ovlTrackWeight", ovlTrackWeight);
    saveValOpt("wt.lengthUnit", lengthUnit);
    saveValOpt("wt.trackColor", trackColor);
    saveValOpt("wt.trackWeight", trackWeight);
    saveValOpt("wt.prunedist", prunedist);
    saveValOpt("wt.prunealt", prunealt);
    saveValOpt("wt.mapslist", mapsList);
    saveValOpt("wt.mapsCloseOnClick", mapsCloseOnClick);
    saveValOpt("wt.apikeyNoMore", apikeyNoMore);
    saveValOpt("wt.wptLabel", wptLabel);
    saveValOpt("wt.extMarkers", extMarkers);
  }

  function saveStateFile() {
    var fullState = {};
    var n = localStorage.length;
    for (i = 0; i < n; i++) {
      var key = localStorage.key(i);
      // include all "wt." storage items
      // but exclude current edited track
      if (key.startsWith("wt.") && (key != "wt.gpx")) {
        var val = localStorage.getItem(key);
        fullState[key] = val;
      }
    }
    var blob = new Blob([JSON.stringify(fullState)],
      isSafari() ? {type: "text/plain;charset=utf-8"} : {type: "application/json;charset=utf-8"}
    );
    saveAs(blob, "wtracks.cfg");
    ga('send', 'event', 'setting', 'export');
  }

  function loadStateFile(filedata) {
    var state;
    try {
      state = JSON.parse(filedata);
    } catch (err) {
      setStatus("Invalid file: " + err, { timeout: 5, class: "status-error" });
    }
    objectForEach(state, function (name, value) {
      if (name.startsWith("wt.")) {
        saveValOpt(name, value);
      }
    });
    $(window).off("unload");
    ga('send', 'event', 'setting', 'import');
    location.reload();
  }

  function onStateFileSelect(evt) {
    var f = evt.currentTarget.files ? evt.currentTarget.files[0] : undefined;
    if (f) {
      var reader = new FileReader();
      reader.onload = function(le) {
        loadStateFile(le.target.result);
      };
      reader.readAsText(f);
    }
    evt.preventDefault();
  }
  $('#save-state-file').on('click', saveStateFile);
  $('#load-state-file').on('change', onStateFileSelect);
  $('#load-state-file').on('click', function (e) {
    if (!confirm(
        "This will override all your settings (maps, activities, etc.)\nContinue?"
    )) {
      e.preventDefault();
    }
  });

  function saveState() {
    if (isStateSaved()) {
      saveTrack();
      savePosition();
      saveEditMode();
    }
  }

  function restoreEditMode() {
    var restoredMode = getVal("wt.editMode", EDIT_DEFAULT);
    setEditMode(parseInt(restoredMode));
  }

  function restorePosition() {
    var defpos = getSavedPosition(config.display.pos.lat, config.display.pos.lng);
    showLocation = LOC_ONCE;
    setLocation(defpos);
  }

  function restoreTrack() {
    var gpx = getVal("wt.gpx", null);
    if (gpx) {
      loadCount = 0;
      fileloader.loadData(gpx, "dummy", "gpx");
      return true;
    } else {
      return false;
    }
  }

  function restoreState() {
    restorePosition();
    restoreTrack();
    restoreEditMode();
  }

  function clearSavedState() {
    for (var i=localStorage.length - 1; i >= 0; i--) {
      var key = localStorage.key(i);
      if (key.startsWith("wt.") && (key != "wt.saveState")) {
        storeVal(key, undefined);
      }
    }
  }

  function getProvider(mapobj) {
    var url = typeof mapobj.url === "string" ? mapobj.url : mapobj.url();
    var p = null;
    var protocol = url.split('/')[0];
    // skip HTTP URLs when current is HTTPS
    if (protocol.length == 0 || protocol == location.protocol) {
      var tileCtor;
      var mapopts = mapobj.options;
      if (isUnset(mapobj.type) || (mapobj.type === "base") || (mapobj.type === "overlay")) {
        tileCtor = L.tileLayer;
      } else {
        tileCtor = L.tileLayer[mapobj.type];
        if (mapobj.type === "wms" && mapopts.crs) {
          mapopts = Object.assign({}, mapopts);
          mapopts.crs = getCrsFromName(mapopts.crs);
        }
      }
      if (tileCtor) {
        p = tileCtor(url, mapopts);
      }
    }
    return p;
  }

  // Add maps and overlays
  var baseLayers = {};
  var overlays = {};
  mapsForEach(function(name, props) {
    if (props.on) {
      var inList = props.in == MAP_MY ? mymaps : config.maps;
      var tile = getProvider(inList[name]);
      if (tile) {
        if (inList[name].type === "overlay") {
          overlays[name] = tile;
        } else {
          baseLayers[name] = tile;
        }
      }
    }
  });

  var baseLayerControl = L.control.layers(baseLayers, overlays);
  baseLayerControl.addTo(map);

  // ----------------------

  var baseLayer = getVal("wt.baseLayer", config.display.map);
  map.addLayer(baseLayers[baseLayer] || baseLayers[config.display.map]);
  var layerInit = true;

  map.on("baselayerchange", function(e) {
    baseLayer = e.name;
    if (layerInit) {
      // deffer to make sure GA is initialized
      setTimeout(function(){
        ga('send', 'event', 'map', 'init', baseLayer);
      }, 2000);
      layerInit = false;
    } else {
      ga('send', 'event', 'map', 'change', baseLayer);
    }
    saveValOpt("wt.baseLayer", baseLayer);
    if (mapsCloseOnClick) {
      $(".leaflet-control-layers").removeClass("leaflet-control-layers-expanded");
    }
  });

  function changeBaseLayer(mapname) {
    var found = false;
    $(".leaflet-control-layers-base .leaflet-control-layers-selector").each(function(idx,elt) {
      if (mapname === elt.nextSibling.innerText.substring(1)) {
        $(elt).click();
        found = true;
        return false; // stop each loop
      }
    });
    if (!found) {
      // map is missing, inform user
      setTimeout(function(){
        setStatus("Requested map not visible/configured: " + mapname, { timeout: 5, class: "status-error" });
      }, 4000);
    }
  }

  var overlaysOn = getJsonVal("wt.overlaysOn", {});

  function setOverlay(name, yesno) {
    overlaysOn[name] = yesno;
    saveJsonValOpt("wt.overlaysOn", overlaysOn);
  }

  if (JSON.parse && JSON.stringify) {

    objectForEach(overlaysOn, function(oname, oon) {
      var ovl =  overlays[oname];
      if (ovl) {
        if (oon) {
          map.addLayer(ovl);
        }
      } else {
        // doesn't exist anymore, delete it
        setOverlay(oname, undefined);
      }
    });

    map.on("overlayadd", function(e) {
      ga('send', 'event', 'map', 'overlay', e.name);
      setOverlay(e.name, true);
    });

    map.on("overlayremove", function(e) {
      setOverlay(e.name, false);
    });

  }
  setLocation({lat: 0, lng: 0}); // required to initialize map

  // ---------------------------------------------------------------------------
  // Elevation service

  // Google elevation API
  function googleElevationService(locations, points, inc, done, fail) {
    var elevator;
    try {
      elevator = new google.maps.ElevationService();
    } catch (e) {
      // Google elevation service not available, cancel
      return;
    }
    elevator.getElevationForLocations({
      'locations': locations
    }, function(results, status) {
      if (status === 'OK') {
        if (isUndefined(points.length)) {
          // single point elevation
          points.alt = results[0].elevation;
        } else {
          for (var i = 0; i < results.length; i++) {
            var pos = i * inc;
            if (pos >= points.length) {
              // we reached last point from track
              pos = points.length - 1;
            }
            points[pos].alt = results[i].elevation;
          }
        }
        done("g.elevate");
      } else {
        fail('g.elevate.ko');
      }
    });
  }

  // https://github.com/Jorl17/open-elevation
  function openElevationService(locations, points, inc, done, fail) {
    var ajaxreq, i, len;
    // GET is faster for small number of points (avoid OPTIONS preflight request)
    if (locations.length < 20) {
      // GET method
      var strpts = "";
      for (i = 0, len=locations.length; i < len; i++) {
        if (i>0) strpts += "|";
        strpts += locations[i].lat + "," + locations[i].lng;
      }
      ajaxreq = {
        url: "https://api.open-elevation.com/api/v1/lookup?locations=" + strpts,
        method: "GET",
        timeout: config.elevationTimeout,
      };
    } else {
      // POST method
      var jsonreq = { locations: [] };
      for (i = 0, len=locations.length; i < len; i++) {
        jsonreq.locations.push(
          {
            "latitude": locations[i].lat,
            "longitude": locations[i].lng
          }
        );
      }
      ajaxreq = {
        url: "https://api.open-elevation.com/api/v1/lookup",
        method: "POST",
        timeout: config.elevationTimeout,
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(jsonreq)
      };
    }
    $.ajax(ajaxreq)
    .done(function(json) {
      if (isUndefined(points.length)) {
        // single point elevation
        points.alt = json.results[0].elevation;
      } else {
        for (var i = 0; i < json.results.length; i++) {
          var pos = i * inc;
          if (pos >= points.length) {
            // we reached last point from track
            pos = points.length - 1;
          }
          points[pos].alt = json.results[i].elevation;
        }
      }
      done("o.elevate");
    })
    .fail(function(err) {
      fail('o.elevate.ko');
    });
  }


  // https://openrouteservice.org/dev/#/api-docs/elevation/line/post
  function orsElevationService(locations, points, inc, done, fail) {
    var i, len,
      polyline = [];

    if (locations.length == 1) {
      // single point
      $.ajax({
        url: "https://api.openrouteservice.org/elevation/point",
        headers: {
          "Authorization": getApiKey(orskey)
        },
        method: "POST",
        timeout: config.elevationTimeout,
        contentType: "application/json",
        data: JSON.stringify({
          "format_in": "point",
          "geometry": [ locations[0].lng, locations[0].lat ]
        }),
        dataType: "json"
      })
      /*
      $.get({
        url: "https://api.openrouteservice.org/elevation/point?" +
          "api_key=" + getApiKey(orskey) +
          "&geometry=" + locations[0].lng + "," + locations[0].lat,
        dataType: "json"
      })
      */
      .done(function (json) {
        if (json.geometry && json.geometry.coordinates && json.geometry.coordinates[0]) {
          points.alt = json.geometry.coordinates[2];
          done('ors.elevate1');
        } else {
          fail('ors.elevate1.ko');
        }
      })
      .fail(function(err) {
        fail('ors.elevate1.ko');
      });
      return;
    }
    // multi-points
    for (i = 0, len=locations.length; i < len; i++) {
      polyline.push([locations[i].lng, locations[i].lat]);
    }
    $.ajax({
      url: "https://api.openrouteservice.org/elevation/line",
      headers: {
        "Authorization": getApiKey(orskey)
      },
      method: "POST",
      timeout: config.elevationTimeout,
      contentType: "application/json",
      data: JSON.stringify({
        "format_in": "polyline",
        "format_out": "polyline",
        "geometry": polyline
      }),
      dataType: "json"
    })
    .done(function(json) {
      if (json.geometry && json.geometry[0]) {
        var results = json.geometry;
        for (var i = 0; i < results.length; i++) {
          var pos = i * inc;
          if (pos >= points.length) {
            // we reached last point from track
            pos = points.length - 1;
          }
          points[pos].alt = results[i][2];
        }
        done("ors.elevate");
      } else {
        fail('ors.elevate.ko');
      }
    })
    .fail(function(err) {
      fail('ors.elevate.ko');
    });
  }

  // multi-point elevation API
  function elevatePoints(points, cb) {
    if (!points || (points.length === 0)) {
      return;
    }
    var locations;
    var inc;
    if (isUndefined(points.length)) {
      locations = [points];
    } else {
      setStatus("Elevating..", { spinner: true });
      inc = Math.ceil(Math.max(1, points.length / 511)); // keep one for last point
      if (inc == 1) {
        locations = points;
      } else {
        locations = [];
        for (var i = 0; i < points.length; i += inc) {
          locations.push(points[i]);
        }
        // make sure last point is included
        if ((i < points.length) || (i-inc < (points.length - 1))) {
          locations.push(points[points.length - 1]);
        }
      }
    }
    var callerName = arguments.callee && arguments.callee.caller ? arguments.callee.caller.name : elevatePoints.caller.name;
    callElevationService(callerName, locations, points, inc, cb);
  }

  function callElevationService(callerName, locations, points, inc, cb) {
    elevationService(locations, points, inc,
      function(eventName){
        ga('send', 'event', 'api', eventName, callerName, locations.length);
        clearStatus();
        // callback
        if (cb) cb(true);
      },
      function(eventName){
        ga('send', 'event', 'api', eventName, callerName, locations.length);
        warn("elevation request failed");
        setStatus("Elevation failed", {
          timeout: 3,
          class: "status-error"
        });
        if (elevationService == defaultElevatonService) {
          openApiKeyInfo();
        }
        // callback
        if (cb) cb(false);
      });
  }

  // Select elevation service
  var elevate = elevatePoints;
  var elevatePoint = elevatePoints;
  var defaultElevatonService = openElevationService;
  var elevationService;

  function setElevationService() {
    elevationService = getApiKey(ggkey) ?
      googleElevationService :
      (getApiKey(orskey) ? orsElevationService : defaultElevatonService);
  }
  setElevationService();

  // ---------------------------------------------------------------------------

  new L.Control.GeoSearch({
    provider: new L.GeoSearch.Provider.OpenStreetMap(),
    position: 'topleft',
    searchLabel: "Enter place name (f)",
    showMarker: false,
    showPopup: true,
    //customIcon: false,
    customIcon: L.divIcon({html:'<span class="material-icons">&#xE8B6;</span>'}),
    retainZoomLevel: true,
    draggable: false
  }).addTo(map);

  L.MyLocationControl = L.Control.extend({

    options: {
      position: 'topleft',
    },

    onAdd: function(map) {
      var container = L.DomUtil.create('div', 'leaflet-control leaflet-bar leaflet-control-edit'),
        link = L.DomUtil.create('a', '', container);

      link.href = '#';
      link.title = 'My location (l)';
      link.innerHTML = '<span id="myloc" class="material-icons wtracks-control-icon">&#xE55C;</span>';
      //link.id = 'myloc';
      L.DomEvent.disableClickPropagation(link);
      L.DomEvent.on(link, 'click', L.DomEvent.stop)
        .on(link, 'click', function(e) {
          map.closePopup();
          if (showLocation == LOC_CONTINUOUS) {
            showLocation = LOC_NONE;
            $("#myloc").removeClass("control-selected");
            removeMyLocMarker();
          } else if (showLocation == LOC_ONCE) {
            showLocation = LOC_CONTINUOUS;
            $("#myloc").addClass("control-selected");
          } else {
            showLocation = LOC_ONCE;
            gotoMyLocation();
          }
        }, this);

      return container;
    }

  });
  map.addControl(new L.MyLocationControl());

  L.EditControl = L.Control.extend({

    options: {
      position: 'topleft',
      kind: '',
      html: '',
      event: 'click'
    },

    onAdd: function(map) {
      var container = L.DomUtil.create('div', 'leaflet-control leaflet-bar leaflet-control-edit'),
        link = L.DomUtil.create('a', '', container),
        editopts = L.DomUtil.create('span', '', container);

      link.href = '#';
      link.title = this.options.title;
      link.innerHTML = this.options.html;
      L.DomEvent.disableClickPropagation(link);
      L.DomEvent.on(link, this.options.event, L.DomEvent.stop)
        .on(link, this.options.event, function(e) {
          map.closePopup();
          var et = $("#edit-tools");
          et.toggle();
          if (!et.is(":visible")) {
            setEditMode(EDIT_NONE);
          }
        }, this);

      editopts.id = 'edit-tools';
      editopts.class = 'wtracks-control-icon';
      editopts.innerHTML = '<a href="#" title="Manual Track (e)" id="edit-manual"><span class="material-icons wtracks-control-icon">&#xE922;</span></a>' +
      '<a href="#" title="Auto Track (a)" id="edit-auto"><span class="material-icons wtracks-control-icon">&#xE55D;</span></a>' +
      '<a href="#" title="Add segment" id="add-segment">' +
        '<span class="material-icons wtracks-control-icon segment-icon">&#xe6e1</span>' +
        '<span class="material-icons wtracks-control-icon add-segment-icon">&#xe145</span>' +
      '</a>' +
      '<a href="#" title="Delete segment" id="delete-segment">' +
        '<span class="material-icons wtracks-control-icon segment-icon">&#xe6e1</span>' +
        '<span class="material-icons wtracks-control-icon delete-segment-icon">&#xe14c</span>' +
      '</a>' +
      '<a href="#" title="Waypoint (w)" id="edit-marker"><span class="material-icons wtracks-control-icon">&#xE55F;</span></a>';

      return container;
    }

  });
  L.EditorControl = L.EditControl.extend({
    options: {
      position: 'topleft',
      title: 'Toggle Edit',
  //    html: '&#x270e;',
      html: '<span class="material-icons wtracks-control-icon">&#xE3C9;</span>',
      event: 'click'
    }
  });
  map.addControl(new L.EditorControl());

  function isUserInputOngoing() {
    var elt = document.activeElement;
    var tag = elt ? elt.tagName.toLowerCase() : undefined;
    if ((tag == "input") || (tag == "textarea")) {
      return true;
    }
    return false;
  }

  function openedOverlays() {
    return $(".overlay:visible").length;
  }

  $("body").keydown(function(event) {
    // number of currently opened overlays
    nOverlays = openedOverlays();
    // ignore control keys
    if (event.which == 17) return;
    // on escape
    if ((event.which == 27) && (nOverlays == 1)) {
      if (isMenuVisible()) {
        // close menu
        closeMenu();
        return;
      }
      if ($(".overlay:visible").hasClass("leaflet-popup")) {
        // close popup
        map.closePopup();
        return;
      }
    }
    // ignore if an overlay is open
    if ((nOverlays > 0) || isUserInputOngoing()) return;
    switch (event.which) {
      case 27: // escape - exit edit tool
        if (editMode == EDIT_NONE) {
          openMenu();
        } else {
          setEditMode(EDIT_NONE);
        }
        break;
      case 69: // 'e' - edit
        setEditMode(EDIT_MANUAL_TRACK);
        break;
      case 65: // 'a' - auto
        setEditMode(EDIT_AUTO_TRACK);
        break;
      case 87: // 'w' - waypoint
        setEditMode(EDIT_MARKER);
        break;
      case 70: // 'f' - find address
        $(".glass")[0].click();
        return false;
      case 76: // 'l' - my location
        showLocation = LOC_ONCE;
        gotoMyLocation();
        break;
      case 77: // 'm' - my location
        openMenu();
        break;
      case 113: // 'F2' - rename
        promptTrackName();
        break;
      case 85: // 'u' - unit system
        updateUnitSystem(1);
        break;
    }
  });


  L.DomEvent.disableClickPropagation(L.DomUtil.get("edit-manual"));
  L.DomEvent.disableClickPropagation(L.DomUtil.get("edit-auto"));
  L.DomEvent.disableClickPropagation(L.DomUtil.get("edit-marker"));
  L.DomEvent.disableClickPropagation(L.DomUtil.get("add-segment"));
  L.DomEvent.disableClickPropagation(L.DomUtil.get("delete-segment"));
  $("#edit-manual").click(function(e) {
    ga('send', 'event', 'edit', 'manual');
    setEditMode(EDIT_MANUAL_TRACK);
    e.preventDefault();
  });
  $("#edit-auto").click(function(e) {
    ga('send', 'event', 'edit', 'auto');
    if (checkGraphHopperCredit()) {
      setEditMode(EDIT_AUTO_TRACK);
    }
    e.preventDefault();
  });
  $("#edit-marker").click(function(e) {
    ga('send', 'event', 'edit', 'marker');
    setEditMode(EDIT_MARKER);
    e.preventDefault();
  });
  $("#add-segment").click(function(e) {
    ga('send', 'event', 'edit', 'new-segment');
    setEditMode(EDIT_NONE);
    newSegment();
    setEditMode(EDIT_MANUAL_TRACK);
    saveState();
    e.preventDefault();
  });

  $("#delete-segment").click(function(e) {
    if ((getTrackLength() == 0) ||
      !confirm("Delete current segment?")) {
      return;
    }
    ga('send', 'event', 'edit', 'delete-segment');
    deleteSegment(track);
    saveState();
    e.preventDefault();
  });

  function deleteSegment(segment) {
    setEditMode(EDIT_NONE);
    if (editLayer.getLayers().length > 2) {
      editLayer.removeLayer(segment);
      track = null;
      forEachSegment(function(segment) {
        segmentClickListener({ target: segment }, true);
        // stop on first segment
        return true;
      });
      if (!track) {
        newSegment();
        setEditMode(EDIT_MANUAL_TRACK);
      }
    } else {
      segment.setLatLngs([]);
      polystats.updateStatsFrom(0);
      setEditMode(EDIT_MANUAL_TRACK);
    }
  }

  function toolElevate(e) {
    ga('send', 'event', 'tool', 'elevate', undefined, getTrackLength());
    $("#menu").hide();

    setStatus("Elevating...", { spinner: true });
    var count = 0;
    applySegmentTool(function (segment) {
      count++;
      elevate(segment.getLatLngs(), function(success) {
        if (segment == track) {
          polystats.updateStatsFrom(0);
        }
        if (--count == 0) {
          saveState();
          clearStatus();
        }
      });
    });

    return false;
  }

  $("#elevate").click(toolElevate);

  $("#cleanup").click(function(e) {
    var toclean = [];
    if (isChecked("#cleanupalt")) {
      toclean.push("alt");
    }
    if (isChecked("#cleanuptime")) {
      toclean.push("time");
    }
    if (toclean.length == 0) {
      // nothing to clean
      return;
    }

    var count = 0;

    applySegmentTool(function(segment) {
      var points = segment ? segment.getLatLngs() : undefined;
      if (points && (points.length > 0)) {
        count += points.length;
        for (var i = 0; i < points.length; i++) {
          for (var j = 0; j < toclean.length; j++) {
            points[i][toclean[j]] = undefined;
          }
        }
        if (segment == track) {
          polystats.updateStatsFrom(0);
        }
      }
    });

    if (count) {
      ga('send', 'event', 'tool', 'cleanup', toclean.toString(), count);
      saveState();
    }

    return false;
  });

  $("#revert").click(function(e) {
    var count = 0;
    applySegmentTool(function (segment) {
      var points = segment ? segment.getLatLngs() : undefined;
      if (points && (points.length > 0)) {
        var newpoints = [];
        count += points.length;
        for (var i = points.length - 1; i >= 0; i--) {
          newpoints.push(points[i]);
        }
        segment.setLatLngs(newpoints);
        if (segment == track) {
          polystats.updateStatsFrom(0);
        }
        updateExtremities();
      }
    });

    if (count) {
      ga('send', 'event', 'tool', 'revert', undefined, count);
      saveState();
    }

    return false;
  });

  $(".statistics").click(function(e) {
    var tag = e.target.tagName.toUpperCase();
    if ((tag !== "SELECT") && (tag !== "OPTION")) {
      toggleElevation(e);
    }
  });

  function segmentClickListener(event, noGaEvent) {
    if ((event.target != track) && (editMode <= EDIT_NONE)) {
      if (!noGaEvent) {
        ga('send', 'event', 'edit', 'switch-segment');
      }
      if (track) {
        if (getTrackLength() == 0) {
          // delete empty track
          editLayer.removeLayer(track);
          saveState();
        } else {
          updateOverlayTrackStyle(track);
        }
      }
      track = event.target;
      track.bringToFront();
      updateTrackStyle();
      setPolyStats();
      updateExtremities();
      return true;
    } else {
      return false;
    }
  }

  function importGeoJson(geojson) {

    setEditMode(EDIT_NONE);
    setStatus("Loading..", { spinner: true });
    $("#edit-tools").hide();
    var bounds;
    var merge = loadCount > 0 ||  isChecked("#merge");
    loadCount++;
    if (!merge) {
      newTrack();
      bounds = L.latLngBounds([]);
    } else {
      bounds = L.latLngBounds(track.getLatLngs());
    }
    var wptLayer = waypoints;
    var initLayers = editLayer.getLayers().length;
    var activeTrack = track;

    function newPoint(coord, time, ext, i) {
      var point = L.latLng(coord[1], coord[0]);
      if (coord.length > 2) {
        // alt
        point.alt = coord[2];
      }
      if (!isUndefined(time)) {
        point.time = time;
      }
      if (!isUndefined(ext)) {
        point.ext = ext;
      }
      if (!isUndefined(i)) {
        point.i = i;
      }
      return point;
    }

    function importSegment(name, coords, times, ptExts, xmlnsArr) {
      var v;

      if (joinOnLoad || getTrackLength() == 0) {
        // extend current 'track'
        track.stats = undefined;
      } else {
        newSegment(true);
      }
      v = track.getLatLngs();
      if ((v.length === 0) && (getTrackName() == NEW_TRACK_NAME)) {
        setTrackName(name);
      }

      // import polyline vertexes
      for (var i = 0; i < coords.length; i++) {
        v.push(newPoint(coords[i],
          times ? times[i] : undefined,
          ptExts ? ptExts[i] : undefined,
          i));
      }
      track.setLatLngs(v);
      bounds.extend(track.getBounds());

      // add segment xml namespaces to track
      if (xmlnsArr && xmlnsArr.length) {
        track.xmlnsArr = xmlnsArr;
      }
    }

    if (getTrackName() == NEW_TRACK_NAME) {
      if (geojson.metadata && geojson.metadata.name) {
        setTrackName(geojson.metadata.name);
      }
      if (geojson.metadata && geojson.metadata.desc && !metadata.desc) {
        metadata.desc = geojson.metadata.desc;
      }
    }

    L.geoJson(geojson, {
      onEachFeature: function(f) {
        var name, coords, times, ptExts, xmlnsArr;
        if (f.geometry.type === "LineString") {
          name = f.properties.name ? f.properties.name : NEW_TRACK_NAME;
          coords = f.geometry.coordinates;
          times = f.properties.coordTimes && (f.properties.coordTimes.length == coords.length) ?
            f.properties.coordTimes : undefined;
          ptExts = f.properties.ptExts
            && (f.properties.ptExts.length == coords.length) ?
            f.properties.ptExts : undefined;
          xmlnsArr = f.properties.xmlnsArr;
          importSegment(name, coords, times, ptExts, xmlnsArr);
        }
        if (f.geometry.type === "MultiLineString") {
          name = f.properties.name ? f.properties.name : NEW_TRACK_NAME;
          for (var i = 0; i < f.geometry.coordinates.length; i++) {
            coords = f.geometry.coordinates[i];
            times = f.properties.coordTimes && f.properties.coordTimes[i] &&
              (f.properties.coordTimes[i].length == coords.length) ?
              f.properties.coordTimes[i] : undefined;
            ptExts = f.properties.ptExts && f.properties.ptExts[i] &&
              (f.properties.ptExts[i].length == coords.length) ?
              f.properties.ptExts[i] : undefined;
            xmlnsArr = f.properties.xmlnsArr && f.properties.xmlnsArr[i] ?
                f.properties.xmlnsArr[i] : undefined;
            importSegment(name, coords, times, ptExts, xmlnsArr);
          }
        } else if (f.geometry.type === "Point") {
          // import marker
          coords = f.geometry.coordinates;
          var latlng = newPoint(coords);
          newWaypoint(latlng, f.properties, wptLayer);
          bounds.extend(latlng);
        }
      }
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds);
    }
    clearStatus();
    if (!segmentClickListener({ target: activeTrack }, true)) {
      // no segment added, but existing one was (possibly) extended, update it
      polystats.updateStatsFrom(0);
    }
    saveState();
    closeMenu();
    updateExtremities();
    setExtrimityVisibility(extMarkers);
    var addedLayers = editLayer.getLayers().length - initLayers;
    if (addedLayers) {
      ga('send', 'event', 'file', 'load-segment', undefined, addedLayers);
    }
    return editLayer;
  }

  var loadcontrol = L.Control.fileLayerLoad({
    // Allows you to use a customized version of L.geoJson.
    // For example if you are using the Proj4Leaflet leaflet plugin,
    // you can pass L.Proj.geoJson and load the files into the
    // L.Proj.GeoJson instead of the L.geoJson.
    layer: importGeoJson,
    // See http://leafletjs.com/reference.html#geojson-options
    //layerOptions: {},
    // Add to map after loading (default: true) ?
    addToMap: false,
    // File size limit in kb (default: 1024) ?
    fileSizeLimit: config.maxfilesize,
    // Restrict accepted file formats (default: .geojson, .kml, and .gpx) ?
    formats: [
          '.gpx',
          '.geojson',
          '.kml'
      ],
    fitBounds: false
  });
  map.addControl(loadcontrol);
  var fileloader = loadcontrol.loader;
  var loadCount = 0;
  fileloader.on('data:error', function(e) {
    setStatus("Failed: check file and type", { 'class': 'status-error', 'timeout': 3 });
  });

  function loadFromUrl(url, options) {
    if (!options) {
      options = {};
    }
    setStatus("Loading...", { "spinner": true });
    var _url = options.noproxy ? url : corsUrl(url);
    var req = {
      url: _url,
      success: function(data) {
        loadCount = 0;
        if (options.key) {
          if (!isCryptoSupported()) {
            ga('send', 'event', 'error', 'crypto-not-supported', navigator.userAgent);
            alert("Sorry, you cannot load this file: it is encrypted, and your browser does not provide the required services to decrypt it.");
            newTrack();
            return;
          }
          var encversion = options.key.substring(0,2); // version, ignored for now
          var key = encodeURIComponent(options.key.substring(2));
          var deckey = strdecode(key, key);
          var iv = deckey.substring(0,24);
          var pwd = deckey.substring(24);
          //log("iv  : " + iv);
          //log("pwd : " + pwd);
          ga('send', 'event', 'file', 'decrypt', undefined, Math.round(data.length / 1000));
          aesGcmDecrypt(data, iv, pwd)
          .then(function(gpx) {
            fileloader.loadData(gpx, url, options.ext);
          })
          .catch(function(err) {
            ga('send', 'event', 'error', 'crypto-decrypt', err);
            setStatus("Failed: " + err, { timeout: 5, class: "status-error" });
          });
        } else {
          fileloader.loadData(data, url, options.ext);
        }
      }
    };
    if (options.withCredentials) {
      req.xhrFields = {
        withCredentials: true
      };
    }

    $.ajax(req).fail(function(resp) {
      setStatus("Failed: " + resp.statusText, { 'class': 'status-error', 'timeout': 3 });
      if (!track) {
        newTrack();
        restorePosition();
      }
    });
  }

  function getLoadExt() {
    var ext = getSelectedOption("#track-ext");
    if (ext === "auto") {
      ext = undefined;
    }
    return ext;
  }
  $("#track-get").click(function() {
    var url = $("#track-get-url").val().trim();
    if (!url) {
      $("#track-get-url").focus();
      return;
    }
    ga('send', 'event', 'file', 'load-url');
    setEditMode(EDIT_NONE);
    var noproxy = isChecked("#noproxy");
    loadFromUrl(url, {
      ext: getLoadExt(),
      noproxy: noproxy,
      withCredentials: noproxy
    });
  });
  $("#track-get-url").keypress(function(e) {
    if (e.which == 13) {
      $("#track-get").click();
    }
  });

  $("#track-upload").click(function() {
    $("#track-upload").val("");
  });
  $("#track-upload").change(function() {
    var files = $("#track-upload")[0].files;
    if (files[0]) {
      ga('send', 'event', 'file', 'load-file');
      setEditMode(EDIT_NONE);
      setStatus("Loading...", { spinner: true });
      loadCount = 0;
      fileloader.loadMultiple(files, getLoadExt());
    }
  });
  map.getContainer().addEventListener("drop", function() {
    loadCount = 0;
  });

  /*-- DropBox --*/

  var dropboxLoadOptions = {

    // Required. Called when a user selects an item in the Chooser.
    success: function(files) {
      $("#menu").hide();
      ga('send', 'event', 'file', 'load-dropbox');
      loadFromUrl(files[0].link, {
        ext: getLoadExt(),
        noproxy: true
      });
    },

    // Optional. Called when the user closes the dialog without selecting a file
    // and does not include any parameters.
    cancel: function() {

    },

    // Optional. "preview" (default) is a preview link to the document for sharing,
    // "direct" is an expiring link to download the contents of the file. For more
    // information about link types, see Link types below.
    linkType: "direct", // or "preview"

    // Optional. A value of false (default) limits selection to a single file, while
    // true enables multiple file selection.
    multiselect: false, // or true

    // Optional. This is a list of file extensions. If specified, the user will
    // only be able to select files with these extensions. You may also specify
    // file types, such as "video" or "images" in the list. For more information,
    // see File types below. By default, all extensions are allowed.
    //extensions: ['.gpx', '.json', '.kml', '.geojson'],
  };
  $("#dropbox-chooser").click(function(e) {
    // Check Dropbox is supported
    if (!Dropbox.isBrowserSupported()){
    alert("Sorry, your browser does not support Dropbox loading");
    return;
    }
    try {
      Dropbox.choose(dropboxLoadOptions);
    } catch (err) {
      setStatus("Failed: " + err, { timeout: 5, class: "status-error" });
      alert("Dropbox popup could not open. Make sure you did not forbid popups.")
      ga('send', 'event', 'error', 'Dropbox.choose error', err);
    }
  });

  var dropboxSaveOptions = {
    files: [{}], // to be completed when uploading

    // Success is called once all files have been successfully added to the user's
    // Dropbox, although they may not have synced to the user's devices yet.
    success: function() {
      // Indicate to the user that the files have been saved.
      setStatus("File saved in your Dropbox", { timeout: 3 });
      $("#menu").hide();
      dropboxSaveOptions.deleteTemp();
    },

    // Progress is called periodically to update the application on the progress
    // of the user's downloads. The value passed to this callback is a float
    // between 0 and 1. The progress callback is guaranteed to be called at least
    // once with the value 1.
    progress: function(progress) {},

    // Cancel is called if the user presses the Cancel button or closes the Saver.
    cancel: function() {
      dropboxSaveOptions.deleteTemp();
    },

    // Error is called in the event of an unexpected response from the server
    // hosting the files, such as not being able to find a file. This callback is
    // also called if there is an error on Dropbox or if the user is over quota.
    error: function(errorMessage) {
      setStatus(errorMessage || "Failed", { timeout: 5, class: "status-error" });
      dropboxSaveOptions.deleteTemp();
    },

    deleteTemp: function(res) {
      dropboxTempShare.delete(
        dropboxSaveOptions.gpxurl,
        dropboxSaveOptions.files[0].url,
        dropboxSaveOptions.passcode,
        undefined, function(msg) {
          warn("Failed to delete temp share");
        }
      );
    }

  };

  function dropboxSaver(evt) {
    $("#confirm-dropbox").hide();
    var name = $("#dbs_name").text();
    var gpxurl = $("#dbs_gpxurl").text();
    var rawgpxurl = $("#dbs_rawgpxurl").text();
    var passcode = $("#dbs_passcode").text();
    dropboxSaveOptions.files[0].filename = name + ".gpx";
    dropboxSaveOptions.files[0].url = rawgpxurl;
    dropboxSaveOptions.gpxurl = gpxurl;
    dropboxSaveOptions.passcode = passcode;
    try {
      Dropbox.save(dropboxSaveOptions);
    } catch (err) {
        setStatus("Failed: " + err, { timeout: 5, class: "status-error" });
        ga('send', 'event', 'error', 'Dropbox.save error', error);
    }
  }
  $("#dbs-ok").click(dropboxSaver);
  $("#dbs-cancel").click(function(){
    $("#confirm-dropbox").hide();
  });

  $("#dropbox-saver").click(function(e) {
    // Check Dropbox is supported
    if (!Dropbox.isBrowserSupported()){
      alert("Sorry, your browser does not support Dropbox saving");
      return;
    }
    var name = getConfirmedTrackName().replace(/[\\\/:\*\?"<>|]/g, "_"); // remove forbidden path chars
    var gpx = getTrackGPX(false);
    ga('send', 'event', 'file', 'save-dropbox', undefined, Math.round(gpx.length / 1000));
    dropboxTempShare.upload(
      name, gpx,
      function (gpxurl, rawgpxurl, passcode) {
        //closeMenu();
        $("#dbs_name").text(name);
        $("#dbs_gpxurl").text(gpxurl);
        $("#dbs_rawgpxurl").text(rawgpxurl);
        $("#dbs_passcode").text(passcode);
        $("#confirm-dropbox").show();
      }, function(jqXHR, textStatus, errorThrown) {
        var errmsg = jqXHR.statusText || textStatus || jqXHR;
        alert("Upload failed, is file too big? Reduce it using Tools/Compress");
        ga('send', 'event', 'error', dropboxTempShare.name + ' upload', errmsg, Math.round(gpx.length / 1000));
      }
    );
  });

  /* ------------ */

  var MAX_ROUTE_WPTS = 2;

  function newRouteWaypoint(i, waypoint, n) {

    function getRouteWaypoinContent(latlng, index, marker) {
      if (!route) {
        marker.off("click");
        return; // ignore
      }
      var div = document.createElement("div");

      p = L.DomUtil.create("div", "popupdiv ptbtn", div);
      var del = L.DomUtil.create('a', "", p);
      del.href = "#";
      del.title = "Delete";
      del.innerHTML = "<span class='popupfield'><i class='material-icons'>&#xE872;</i></span>";
      del.onclick = function(e) {
        if (!route) {
          return; // ignore
        }
        var wpts = route.getWaypoints();
        if (wpts.length > 2) {
          wpts.splice(index, 1);
          route.setWaypoints(wpts);
        } else {
          restartRoute();
        }
        map.closePopup();
        e.preventDefault();
      };

      return div;
    }

    var nwpts = route ? route.getWaypoints().length : 0;
    if (nwpts > MAX_ROUTE_WPTS) {
      error("route-pts-overlimit");
      ga('send', 'event', 'error', 'route-pts-overlimit', location.toString(), nwpts);
    }

    if ((getTrackLength() > 0) && (i === 0)) {
      // no start marker for routes that continue an existing track
      return undefined;
    }
    var marker = L.marker(waypoint.latLng, {
      draggable: true,
      icon: MARKER_ICON
    });

    marker.on("click", function(e) {

      L.popup({ "className" : "overlay" })
        .setLatLng(e.latlng)
        .setContent(getRouteWaypoinContent(e.latlng, i, marker))
        .openOn(map);

    });

    return marker;
  }


  // ------------ Length Unit

  var LENGTH_UNIT_METRIC = "0";
  var LENGTH_UNIT_IMPERIAL = "1";

  var defaultLengthUnit = window.navigator.language === "en-US" ?
    LENGTH_UNIT_IMPERIAL : LENGTH_UNIT_METRIC;
  var lengthUnit = getVal("wt.lengthUnit", defaultLengthUnit);

  function isMetric() {
    return lengthUnit === LENGTH_UNIT_METRIC;
  }
  function isImperial() {
    return lengthUnit === LENGTH_UNIT_IMPERIAL;
  }

  function altUnit() {
    var unit = isMetric() ? "m" : "ft";
    return unitSpan(true, unit, false);
  }

  function alt2txt(alt, noUnits) {
    if (alt === undefined) {
      return "?";
    } else {
      if (isImperial()) {
        alt = alt / 0.3048;
      }
      alt = Math.round(alt);
      return noUnits ? alt : alt + altUnit();
    }
  }

  function txt2alt(alt) {
    alt = parseFloat(alt);
    if (isImperial()) {
      alt = alt * 0.3048;
    }
    return alt;
  }

  function dist2txt(dist, noUnits) {
    var unit = "m";
    var roundFactor = 1;
    if (isImperial()) {
      dist /= 0.9144;
      unit = "yd";
      if (dist > 1000) {
        dist /= 1760;
        unit = "mi";
        roundFactor = 10;
      }
    } else {
      if (dist > 2000) {
        dist /= 1000;
        unit = "km";
        roundFactor = 10;
      }
    }
    dist = Math.round(dist * roundFactor) / roundFactor;
    return noUnits ? dist : dist + unitSpan(true, unit, false);
  }

  // ------------ Scale control and unit toggling

  var scaleCtrl;

  function updateUnitSystem(event) {
    if (scaleCtrl) {
      scaleCtrl.remove();
    }
    if (event) {
      // setting changed
      lengthUnit = $("input[name=unitopt]:checked").val();
      saveValOpt("wt.lengthUnit", lengthUnit);
      ga('send', 'event', 'setting', 'lengthUnit', undefined, parseFloat(lengthUnit));
      showStats();
    } else {
      // init
      $("input:radio[name=unitopt][value=" +  lengthUnit + "]").prop("checked",true);
    }
    $(".distUnit").text(isMetric() ? "meter" : "yard");
    scaleCtrl = L.control.scale({
      updateWhenIdle: true,
      metric: isMetric(),
      imperial: isImperial()
    });
    scaleCtrl.addTo(map);
  }
  updateUnitSystem();
  $("input:radio[name=unitopt]").change(updateUnitSystem);

  // --------------- Time

  function unitSpan(spaceBefore, unitTxt, spaceAfter) {
    var res = "";
    if (spaceBefore) {
      res += "<span class='unit-space'> </span>";
    }
    res += "<span class='unit'>" + unitTxt + "</span>";
    if (spaceAfter) {
      res += "<span class='unit-space'> </span>";
    }
    return res;
  }

  function time2txt(time) {
    var strTime = "";
    if (time >= 3600) strTime += Math.floor(time / 3600) + unitSpan(true, "h", true);
    time %= 3600;
    if (time >= 60) strTime += Math.floor(time / 60) + unitSpan(true, "m", true);
    time %= 60;
    strTime += Math.round(time) + unitSpan(true, "s", false);
    return strTime;
  }

  // ---------------- Popups

  function getTrackPointPopupContent(latlng) {
    var div = L.DomUtil.create('div', "popupdiv"),
      data;

    var pts = track.getLatLngs();
    var last = pts[pts.length - 1];

    data = L.DomUtil.create('div', "popupdiv", div);
    data.innerHTML = "<span class='popupfield'>Distance:</span> " +
      dist2txt(latlng.dist) + " / " + dist2txt(last.dist * 2 - latlng.dist);
    data = L.DomUtil.create('div', "popupdiv", div);
    data.innerHTML = "<span class='popupfield'>Est. time:</span> " +
      time2txt(latlng.chrono) + " / " + time2txt(latlng.chrono_rt);
    var trackStart = track.getLatLngs()[0];
    if (latlng.time && trackStart.time) {
      data = L.DomUtil.create('div', "popupdiv", div);
      data.innerHTML = "<span class='popupfield'>Rec. time:</span> " +
      time2txt((new Date(latlng.time) - new Date(trackStart.time))/1000);
    }
    return div;

  }

  function getLatLngPopupContent(latlng, deletefn, splitfn, toadd) {
    var div = L.DomUtil.create("div");
    var p;

    p = L.DomUtil.create("div", "popupdiv", div);
    p.innerHTML = "<span class='popupfield'>Position:</span> " + rounddec(latlng.lat,5) + "," + rounddec(latlng.lng,5);

    if (editMode != EDIT_NONE) {

      p = L.DomUtil.create("div", "popupdiv", div);
      p.innerHTML = "<span class='popupfield'>Altitude:</span> ";
      var altinput = L.DomUtil.create('input', "", p);
      altinput.type = "text";
      altinput.placeholder = "Numeric altitude";
      altinput.class = altinput.className = "atlInput";
      $(altinput).val(isUndefined(latlng.alt) || !isNumeric(latlng.alt) ? "" : alt2txt(latlng.alt, true));
      altinput.onkeyup = function() {
        try {
          latlng.alt = isNumeric(altinput.value) ? txt2alt(altinput.value) : undefined;
        } catch (e) {}
      };
      p = L.DomUtil.create("span", "", p);
      p.innerHTML = altUnit();
    } else {
      if (!isUndefined(latlng.alt)) {
        p = L.DomUtil.create("div", "popupdiv", div);
        p.innerHTML = "<span class='popupfield'>Altitude:</span> " + alt2txt(latlng.alt);
      }
    }

    if (toadd) {
      div.appendChild(toadd);
    }

    if (editMode != EDIT_NONE) {
      // Delete button
      p = L.DomUtil.create("div", "popupdiv ptbtn", div);
      var btn = L.DomUtil.create('a', "", p);
      btn.href = "#";
      btn.title = "Delete";
      btn.innerHTML = "<span class='popupfield'><i class='material-icons'>&#xE872;</i></span>";
      btn.onclick = deletefn;

      if (splitfn) {
        // Split button
        p = L.DomUtil.create("div", "popupdiv ptbtn", div);
        p.id = "split";
        btn = L.DomUtil.create('a', "", p);
        btn.href = "#";
        btn.title = "Split segment from this point";
        btn.innerHTML = "<span class='popupfield'><i class='material-icons'>&#xE14E;</i></span>";
        btn.onclick = splitfn;
      }
    }

    return div;
  }

  function showStats() {
    var pts = track ? track.getLatLngs() : undefined;
    if (pts && pts.length > 0) {
      var last = pts[pts.length - 1];
      var first = pts[0];
      var stats = track.stats;
      $("#distow").html(dist2txt(last.dist));
      $("#distrt").html(dist2txt(2 * last.dist));
      $("#timeow").html(time2txt(last.chrono));
      $("#timert").html(time2txt(first.chrono_rt));
      $("#altmin").html(alt2txt(stats.minalt));
      $("#altmax").html(alt2txt(stats.maxalt));
      $("#climbing").html("+" + alt2txt(stats.climbing));
      $("#descent").html(alt2txt(stats.descent));
    } else {
      $("#distow").html(dist2txt(0));
      $("#distrt").html(dist2txt(0));
      $("#timeow").html(time2txt(0));
      $("#timert").html(time2txt(0));
      $("#altmin").html(alt2txt(0));
      $("#altmax").html(alt2txt(0));
      $("#climbing").html("+" + alt2txt(0));
      $("#descent").html("-" + alt2txt(0));
    }
  }

  map.on('popupclose', function(e) {
    //console.log(e.type);
    if ((editMode === EDIT_MANUAL_TRACK) && (track.editor)) {
      track.editor.continueForward();
    }
  });
  map.on('editable:enable', function(e) {
    //console.log(e.type);
  });
  map.on('editable:drawing:start', function(e) {
    //console.log(e.type);
  });
  map.on('editable:drawing:dragend', function(e) {
    //console.log(e.type);
  });
  map.on('editable:drawing:commit', function(e) {
    //console.log(e.type);
  });
  map.on('editable:drawing:end', function(e) {
    //console.log(e.type);
  });
  map.on('editable:drawing:click', function(e) {
    //console.log(e.type);
  });
  map.on('editable:shape:new', function(e) {
    //console.log(e.type);
  });

  function newVertex(e) {
    var latlng = e.vertex.getLatLng();
    var prev = e.vertex.getPrevious();
    i = isUndefined(prev) ? 0 : prev.latlng.i + 1;
    latlng.i = i;
    //console.log(e.type + ": " + latlng.i);
    if (i == getTrackLength() - 1) {
      // last vertex
      elevatePoint(latlng, function(success) {
        polystats.updateStatsFrom(i);
      });
    }
    updateExtremity(latlng, i);
  }
  map.on('editable:vertex:new', newVertex);

  function dragVertex(e) {
    var latlng = e.vertex.getLatLng();
    var i = latlng.i;
    elevatePoint(latlng, function(success) {
      polystats.updateStatsFrom(i);
    });
    //console.log(e.type + ": " + i);
    updateExtremity(latlng, i);
  }
  map.on('editable:vertex:dragend', dragVertex);

  map.on('editable:middlemarker:mousedown', function(e) {
    //console.log(e.type);
  });

  function dragMarker(e) {
    elevatePoint(e.layer.getLatLng());
    //console.log(e.type);
  }
  map.on('editable:dragend', dragMarker);

  map.on('editable:vertex:deleted', function(e) {
    var i = e.latlng.i;
    //console.log(e.type + ": " + i);
    polystats.updateStatsFrom(i);
    updateExtremities();
  });


  map.on('editable:created', function(e) {
    //console.log("Created: " + e.layer.getEditorClass());
  });

  var MAX_GH_CREDITS = 200;

  function checkGraphHopperCredit(e) {
    var gh = getJsonVal("wt.gh", { credits: 0, reset: new Date(0) });
    var message;

    try {
      // check GraphHopper response
      if (!isUnset(e)) {
        //log("GraphHopper credits: " + e.credits);
        if (e.reset) {
          var now = new Date();
          var resetDate = new Date(now.getTime() + (e.reset * 1000));
          if (resetDate > Date.parse(gh.reset)) {
            gh.reset = resetDate;
            gh.credits = 0;
          }
        }
        if ((e.status >= 400) || (e.remaining === 0)) {
          if (e.status >= 500) {
            message = "GraphHopper error";
            ga('send', 'event', 'api', 'gh-error');
          } else if (e.status == 401) {
            message = "Invalid GraphHopper API key, please fix in Settings";
            ga('send', 'event', 'api', 'gh-invalid');
          } else {
            if (isUndefined(getApiKey(ghkey))) {
              ga('send', 'event', 'api', 'gh-wt-max');
              gh.credits = -1;
            } else {
              ga('send', 'event', 'api', 'gh-perso-max');
              message = "Your GraphHopper API key exhausted its daily quota";
            }
          }
        } else {
          ga('send', 'event', 'api', 'gh-ok', e.credits);
          if ((gh.credits >= 0) && isUndefined(getApiKey(ghkey))) {
            gh.credits += e.credits;
          }
        }
        storeJsonVal("wt.gh", gh);
      }

      if (!message && isUndefined(getApiKey(ghkey))) {
        // user does not have personal gh key, check wtrack key usage
        if (gh.credits < 0) {
          message = "WTracks exhausted its daily GraphHopper quota";
        } else if (gh.credits >= MAX_GH_CREDITS) {
          message = "You exhausted your daily GraphHopper quota";
          if (!isUnset(e)) {
            ga('send', 'event', 'api', 'gh-user-max');
          }
        }
      }
    } catch (err) {
      ga('send', 'event', 'error', 'checkGraphHopperCredit', err);
      message = err;
    }

    if (message) {
      setEditMode(EDIT_NONE);
      showGraphHopperMessage(message);
      return false;
    }
    return true;
  }

  function routingError(err) {
    log("Routing failed " + err);
    ga('send', 'event', 'error', 'routingError', err.toString());
  }

  function newMarker(e) {

    if (editMode == EDIT_MARKER) {
      ga('send', 'event', 'edit', 'new-marker');
      var marker = newWaypoint(e.latlng, {name: "New waypoint"}, waypoints);
      elevatePoint(e.latlng);
      marker.enableEdit();
    } else if (editMode == EDIT_AUTO_TRACK) {
      if (!route) {
        if (!routeStart) {
          setRouteStart(e.latlng);
        } else {
          var fromPt = routeStart,
            toPt = e.latlng,
            router;
          if (getApiKey(ghkey) || !getApiKey(orskey)) {
            router = L.Routing.graphHopper(
              getApiKey(ghkey, config.graphhopper.key()),
              { urlParameters: { vehicle: getCurrentActivity().vehicle } }
            );
            router.on("response", checkGraphHopperCredit);
            router.on("routingerror", routingError);
          } else {
            router = L.Routing.openrouteservice(getApiKey(orskey), {
              profile: getCurrentActivity().vehicle == "foot" ? "foot-hiking" : "cycling-regular",
              parameters: {
                instructions: false,
                elevation: false,
              }
            });
          }
          route = L.Routing.control({
            router: router,
            waypoints: [fromPt, toPt],
            routeWhileDragging: false,
            autoRoute: true,
            fitSelectedRoutes: false,
            lineOptions: {
              styles: [{
                color: trackColor,
                weight: trackWeight,
                opacity: 1,
                interactive: false
              }],
              addWaypoints: true
            },
            createMarker: newRouteWaypoint,
            show: false
          }).addTo(map);
        }
      } else {
        var wpts = route.getWaypoints();
        if (wpts.length >= MAX_ROUTE_WPTS) { // up to 4 with free version
          try {
            mergeRouteToTrack();
            restartRoute();
            map.fireEvent("click", { latlng: e.latlng });
          } catch(err) {
            ga('send', 'event', 'error', 'merge-route-failed', err.toString() + ", " + navigator.userAgent, wpts.length);
          }
        } else {
          wpts.push({ latLng: e.latlng });
          route.setWaypoints(wpts);
        }
      }
    } else {
      closeOverlays();
      closeMenu();
    }
  }
  map.on('click', newMarker);

  map.on('editable:vertex:click', function(e) {

    function deleteTrackPoint(event) {
      e.vertex.delete();
      map.closePopup(pop);
      event.preventDefault();
    }
    function splitSegment(event) {
      ga('send', 'event', 'edit', 'split-segment');
      setEditMode(EDIT_NONE);
      var i = e.latlng.i;
      var seg1 = track.getLatLngs().slice(0,i),
          seg2 = track.getLatLngs().slice(i);
      var xmlnsArr = track.xmlnsArr;
      track.setLatLngs(seg1);
      polystats.updateStatsFrom(0);
      newSegment();
      track.setLatLngs(seg2);
      track.xmlnsArr = xmlnsArr;
      polystats.updateStatsFrom(0);
      saveState();
      setEditMode(EDIT_MANUAL_TRACK);
      map.closePopup(pop);
      event.preventDefault();
    }

    if (e.originalEvent.shiftKey) {
      // shortcut to delete a vertex
      e.vertex.delete();
      return;
    }
    track.editor.commitDrawing();
    if (getTrackLength() === 0) {
      setEditMode(EDIT_MANUAL_TRACK);
      return;
    }
    e.cancel();
    var div = getTrackPointPopupContent(e.latlng);
    var splitfn,
        i = e.latlng.i,
        len = getTrackLength();
    if ((i>1) & (i<len-1)) {
      splitfn = splitSegment;
    }
    var pop = L.popup({ "className" : "overlay" })
      .setLatLng(e.latlng)
      .setContent(getLatLngPopupContent(e.latlng, deleteTrackPoint, splitfn, div))
      .openOn(map);
    $(".leaflet-popup-close-button").click(function(e) {
      track.editor && track.editor.continueForward();
      return false;
    });
  });

  // ---- ELEVATION
  var elevation;

  function hideElevation() {
    if (elevation) toggleElevation();
  }

  function toggleElevation(e) {
    // is elevation currently displayed?
    if (!elevation) {
      // ignore if track has less than 2 points
      if (track && getTrackLength() > 1) {
        setEditMode(EDIT_NONE);
        map.closePopup();
        var options = $(document).width() < 600 ? {
          width: 355,
          height: 125,
          margins: {
            top: 10,
            right: 10,
            bottom: 25,
            left: 40
          }
        } : {};
        options.imperial = isImperial();
        var el = L.control.elevation(options);
        var gjl = L.geoJson(track.toGeoJSON(), {
          onEachFeature: el.addData.bind(el)
        });
        try {
          el.addTo(map);
          gjl.setStyle({ opacity: 0 });
          gjl.addTo(map);
          elevation = {
            el: el,
            gjl: gjl
          };
        } catch (err) {
          log('no elevation');
        }
      }
    } else {
      elevation.gjl.remove();
      elevation.el.remove();
      elevation = undefined;
    }
  }

  $(".appname").text(config.appname);
  setStatus("Welcome to " + config.appname + "!", { timeout: 3 });

  function menu(item, event) {
    $("#menu").show();
    $("#menu>table").hide();
    $(".tablinks").removeClass("active");
    $("#tab" + item).addClass("active");
    $("#menu #menu" + item).show();
    if (event) {
      event.preventDefault();
    }
    ga('send', 'event', 'menu', item);
  }
  $(".tablinks").click(function(event) {
    menu(event.target.id.replace("tab", ""), event);
  });
  $(".donatebtn").click(function(event) {
    ga('send', 'event', 'menu', 'donate', event.target.id);
  });


  $("#cfgsave").change(function(e) {
    var saveCfg = isChecked("#cfgsave");
    setSaveState(saveCfg);
    setStateSaved(saveCfg);
    if (saveCfg) {
      saveState();
      saveSettings();
    } else {
      clearSavedState();
    }
  });
  function setStateSaved(save) {
    if (save != isChecked()) {
      setChecked("#cfgsave", save);
    }
    if (save) {
      $(".state-file").removeAttr("disabled");
      $(".state-file").removeClass("disabled-button");
    } else {
      $(".state-file").attr("disabled", true);
      $(".state-file").addClass("disabled-button");
    }
  }

  setChecked("#merge", false);

  // get visit info
  var about = getVal("wt.about", undefined);
  // set saving status
  setStateSaved(isStateSaved());

  // make sure we have a track
  newTrack();

  // map parameter
  var mapname = getParameterByName("map");
  if (mapname) {
    ga('send', 'event', 'file', 'load-mapparam');
    changeBaseLayer(mapname);
  }

  var url = getParameterByName("url");
  if (url) {
    ga('send', 'event', 'file', 'load-urlparam');
    var qr = getParameterByName("qr");
    if (qr === "1") {
      ga('send', 'event', 'file', 'load-qrcode');
    }
    showLocation = LOC_NONE;
    loadFromUrl(url, {
      ext: getParameterByName("ext"),
      noproxy: getParameterByName("noproxy"),
      withCredentials: getParameterByName("noproxy"),
      key: getParameterByName("key")
    });
    setEditMode(EDIT_NONE);
  } else {
    restoreState();
  }

  /* Show About dialog if not shown since a while */
  var now = new Date();
  var ONE_MONTH = Math.round(1000*60*60*24*30.5); // 1 month in ms
  var FIRST_VISIT = "1";
  if (about) {
    if ((about == FIRST_VISIT) || (now.getTime() > new Date(about).getTime() + ONE_MONTH)) {
      // reset about tag
      storeVal("wt.about", now.toISOString());
      // wait for potential urlparam to be loaded
      setTimeout(function(){ openMenu("about"); }, 4000);
    }
  } else {
    storeVal("wt.about", FIRST_VISIT);
  }

  initTrackDisplaySettings();

  /* -------------- Share libs --------------- */

  var pasteLibSelect = $("#share-libs")[0];
  function initShareLib() {
    objectForEach(pastesLib, function(name, pl) {
      if (pl.enabled) {
        addSelectOption(pasteLibSelect, name, pl.name);
      }
    });
  }
  function changeShareLib(evt) {
    var libname = getSelectedOption(pasteLibSelect);
    share = pastesLib[libname] || share;
    $("#share-web").html("<a href='" + share.web + "' title='" + share.web + "' >" + share.web + "</a>");
    $("#share-max-size").html(share.maxSize);
    $("#share-max-time").html(share.maxTime);
    $("#share-max-downloads").html(share.maxDownloads);
    $("#share-status").html("?");
    share.ping(
      function() { $("#share-status").html("working <span class='green material-icons'>check_circle_outline</span>");},
      function() { $("#share-status").html("NOT working <span class='red material-icons'>highlight_off</span>");}
    );
    // share prompt dialog
    $("#wtshare-name").text(share.name);
    $("#wtshare-web").attr("href", share.web);
    saveValOpt("wt.share", libname);
  }
  initShareLib();
  selectOption(pasteLibSelect, sharename);
  changeShareLib();
  $("#share-libs").on("change", changeShareLib);

  /* ------------------------------------------- */

  // specific style for personal maps & overlays
  $(".leaflet-control-layers-list .leaflet-control-layers-selector").each(function(idx, elt) {
    var name = elt.nextSibling.innerText.substring(1);
    var props = getMapListEntryProps(name);
    if (props && (props.in == MAP_MY)) {
      $(elt.nextSibling).addClass("mymap-name");
    }
  });
  // add "settings" link in map selector
  $(".leaflet-control-layers-base").append(
    "<label><div>&nbsp;<i class='material-icons'>settings&nbsp;</i><a href='./maps.html'>More...</a></div></label>"
  );
  // add option to automatically close map selector when a listed entry is clicked
  $(".leaflet-control-layers-base").append(
    "<label for='close-on-click'><div><input type='checkbox' id='close-on-click'> Auto close</div></label>"
  );
  setChecked("#close-on-click", mapsCloseOnClick);
  $("#close-on-click").change(function (event) {
    mapsCloseOnClick = isChecked("#close-on-click");
    saveValOpt("wt.mapsCloseOnClick", mapsCloseOnClick);
  });

  // Persist joinOnLoad option
  joinOnLoad = getBoolVal("wt.joinOnLoad", false);
  setChecked("#joinonload", joinOnLoad);
  $("#joinonload").change(function(e) {
    joinOnLoad = isChecked("#joinonload");
    saveValOpt("wt.joinOnLoad", joinOnLoad);
  });

  // ready
  $("#menu-button").click(function() {
    if (isMenuVisible()) {
      closeMenu();
    } else {
      openMenu();
    }
    return false;
  });

  // reset URL if it contains query parameters
  if (window.location.search && window.history && window.history.pushState) {
    window.history.pushState({}, document.title, window.location.pathname);
  }

  $(window).on("unload", function() {
    saveState();
  });

});
