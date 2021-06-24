const axios = require('axios')

// read configured E-Com Plus app data
const getAppData = require('./../../lib/store-api/get-app-data')

const SKIP_TRIGGER_NAME = 'SkipTrigger'
const ECHO_SKIP = 'SKIP'
const ECHO_API_ERROR = 'STORE_API_ERR'

exports.post = ({ appSdk }, req, res) => {
  // receiving notification from Store API
  const { storeId } = req

  /**
   * Treat E-Com Plus trigger body here
   * Ref.: https://developers.e-com.plus/docs/api/#/store/triggers/
   */
  const trigger = req.body

  // get app configured options
  getAppData({ appSdk, storeId })

    .then(appData => {
      if (
        Array.isArray(appData.ignore_triggers) &&
        appData.ignore_triggers.indexOf(trigger.resource) > -1
      ) {
        // ignore current trigger
        const err = new Error()
        err.name = SKIP_TRIGGER_NAME
        throw err
      }

      /* DO YOUR CUSTOM STUFF HERE */
      const { resource } = trigger
      if (resource === 'orders' && trigger.action !== 'delete') {
        const resourceId = trigger.resource_id || trigger.inserted_id
        if (resourceId) {
          const url = appData.spe_webhook_uri
          console.log(`Trigger for Store #${storeId} ${resourceId} => ${url}`)
          if (url) {
            appSdk.apiRequest(storeId, `${resource}/${resourceId}.json`)
              .then(async ({ response }) => {
                let customer
                console.log(`> Sending ${resource} notification`)
                return axios({
                  method: 'post',
                  url,
                  data: {
                    storeId,
                    trigger,
                    [resource.slice(0, -1)]: response.data
                  }
                })
              })
              .then(({ status }) => console.log(`> ${status}`))
              .catch(error => {
                const { response } = error
                if (response) {
                  const err = new Error(`#${storeId} notification to ${url} failed > ${response.status}`)
                  err.response = JSON.stringify(response.data)
                  return console.error(err)
                }
                console.error(error)
              })
            return res.sendStatus(202)
          }
        }
      }
      res.sendStatus(204)
    })

    .catch(err => {
      if (err.name === SKIP_TRIGGER_NAME) {
        // trigger ignored by app configuration
        res.send(ECHO_SKIP)
      } else if (err.appWithoutAuth === true) {
        const msg = `Webhook for ${storeId} unhandled without authentication found`
        const error = new Error(msg)
        error.trigger = JSON.stringify(trigger)
        console.error(error)
        res.send(msg)
      } else {
        // console.error(err)
        // request to Store API with error response
        // return error status code
        res.status(500)
        const { message } = err
        res.send({
          error: ECHO_API_ERROR,
          message
        })
      }
    })
}
